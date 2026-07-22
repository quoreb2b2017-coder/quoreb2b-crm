import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Batch } from '../batches/schemas/batch.schema';
import { resolveRootBatchId } from '../batches/batch-root.util';
import { resolveBatchPeriod } from '../batches/batch-month.util';
import type { LeadRowChange } from '../activity-logs/lead-diff.util';
import { DispositionEntry } from './schemas/disposition-entry.schema';
import {
  CallbackReminder,
  CallbackReminderHours,
} from './schemas/callback-reminder.schema';
import { detectCampaignChannel, toQcCampaignChannel } from '../qc/qc-channel.util';
import { statusChangedInColumns } from '../qc/qc-status.util';
import { compactRowDataPoints } from '../qc/qc-row.util';
import {
  DISPOSITION_KIND_LABELS,
  DISPOSITION_TREE_KINDS,
  DispositionKind,
  duePeriodFromNow,
  monthsAheadForDispositionKind,
} from './disposition.constants';
import {
  classifyDispositionKind,
  shouldEnqueueDispositionArchive,
  readRowDisposition,
} from './disposition-status.util';
import { QcCampaignChannel, QC_CHANNEL_LABELS } from '../qc/qc.constants';
import type {
  CreateCallbackReminderDto,
  DeleteDispositionCampaignDto,
  DispositionListQueryDto,
} from './dto/disposition.dto';
import { SystemRole } from '../../common/constants/roles.constant';
import { QcEntry } from '../qc/schemas/qc-entry.schema';

export interface DispositionEntryResponse {
  id: string;
  employeeId: string;
  employeeName?: string;
  batchId: string;
  rootBatchId?: string;
  campaignName: string;
  campaignChannel: QcCampaignChannel;
  channelLabel: string;
  batchMonth?: number;
  batchYear?: number;
  rowIndex: number;
  leadKey: string;
  leadLabel?: string;
  dispositionKind: DispositionKind;
  dispositionLabel: string;
  statusValue?: string;
  headers: string[];
  rowData: string[];
  changedColumns: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DispositionTreeNode {
  key: string;
  label: string;
  kind: 'kind' | 'year' | 'month' | 'campaign' | 'employee';
  count?: number;
  dispositionKind?: DispositionKind;
  channel?: QcCampaignChannel;
  year?: number;
  month?: number;
  children?: DispositionTreeNode[];
  entries?: DispositionEntryResponse[];
}

@Injectable()
export class DispositionService {
  private readonly logger = new Logger(DispositionService.name);

  constructor(
    @InjectModel(DispositionEntry.name)
    private dispositionEntryModel: Model<DispositionEntry>,
    @InjectModel(CallbackReminder.name)
    private callbackReminderModel: Model<CallbackReminder>,
    @InjectModel(QcEntry.name) private qcEntryModel: Model<QcEntry>,
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
  ) {}

  /** Queue archive when employee picks Do Not Call or Call after 3/6 months. */
  async enqueueFromBatchUpdate(params: {
    batch: Batch;
    actorId: string;
    actorName?: string;
    oldHeaders: string[];
    oldRows: string[][];
    newHeaders: string[];
    newRows: string[][];
    changes: LeadRowChange[];
  }): Promise<void> {
    const { batch, actorId, changes } = params;
    if (!batch.sourceBatchId) return;

    const isAssignee = (batch.sharedWith as Types.ObjectId[])?.some(
      (u) => u.toString() === actorId,
    );
    const isCreator = batch.createdBy?.toString() === actorId;
    if (!isAssignee || isCreator) return;

    const statusChanges = changes.filter((ch) =>
      statusChangedInColumns(params.newHeaders, ch.changedColumns),
    );
    if (!statusChanges.length) return;

    const rootBatchId = await resolveRootBatchId(this.batchModel, batch._id.toString());
    const rootBatch = await this.batchModel.findById(rootBatchId).lean().exec();
    const channel = this.resolveChannel(batch, rootBatch);
    const campaignPeriod = resolveBatchPeriod(batch as unknown as Record<string, unknown>);
    const campaignName = rootBatch?.name ?? batch.name;

    for (const ch of statusChanges) {
      const row = params.newRows[ch.rowIndex] ?? [];
      const prev = params.oldRows[ch.rowIndex] ?? [];
      const statusValue = readRowDisposition(params.newHeaders, row);
      const employeeOid = new Types.ObjectId(actorId);

      // Local-only / non-archive statuses: clear any prior archive for this row
      if (statusValue && !shouldEnqueueDispositionArchive(statusValue)) {
        await this.dispositionEntryModel
          .deleteMany({
            batchId: batch._id,
            rowIndex: ch.rowIndex,
            employeeId: employeeOid,
          })
          .exec()
          .catch(() => undefined);
        continue;
      }

      if (!statusValue || !shouldEnqueueDispositionArchive(statusValue)) continue;

      const dispositionKind = classifyDispositionKind(statusValue);
      if (!dispositionKind) continue;
      // Only archive DNC + scheduled call-after folders (legacy VM read-only via tree).
      if (
        dispositionKind !== 'do_not_call' &&
        dispositionKind !== 'call_after_3_months' &&
        dispositionKind !== 'call_after_6_months'
      ) {
        continue;
      }

      const compact = compactRowDataPoints(params.newHeaders, row);
      if (compact.headers.length === 0) continue;

      const monthsAhead = monthsAheadForDispositionKind(dispositionKind);
      const folderPeriod =
        monthsAhead != null ? duePeriodFromNow(monthsAhead) : campaignPeriod;

      try {
        await this.dispositionEntryModel.findOneAndUpdate(
          {
            batchId: batch._id,
            rowIndex: ch.rowIndex,
            employeeId: employeeOid,
            dispositionKind,
          },
          {
            $set: {
              employeeName: params.actorName,
              rootBatchId: new Types.ObjectId(rootBatchId),
              campaignName,
              campaignChannel: channel,
              // Call-after folders use due month; DNC keeps campaign period.
              batchMonth: folderPeriod.batchMonth,
              batchYear: folderPeriod.batchYear,
              leadKey: ch.leadKey,
              leadLabel: ch.leadLabel,
              statusValue,
              headers: compact.headers,
              rowData: compact.rowData,
              previousRowData: [...prev],
              changedColumns: ch.changedColumns,
            },
          },
          { upsert: true, new: true },
        );
        // Drop other archive kinds for this row so it lives in one section
        await this.dispositionEntryModel
          .deleteMany({
            batchId: batch._id,
            rowIndex: ch.rowIndex,
            employeeId: employeeOid,
            dispositionKind: { $ne: dispositionKind },
          })
          .exec()
          .catch(() => undefined);
        // Leave QC when marked DNC (scheduled call-after stays eligible for QC if already there)
        if (dispositionKind === 'do_not_call') {
          await this.qcEntryModel
            .deleteMany({
              batchId: batch._id,
              rowIndex: ch.rowIndex,
              employeeId: employeeOid,
              state: 'pending',
            })
            .exec()
            .catch(() => undefined);
        }
      } catch (err) {
        this.logger.warn(
          `Disposition enqueue failed row ${ch.rowIndex}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async getAllEntries(
    roles: string[],
    query: DispositionListQueryDto,
  ): Promise<DispositionEntryResponse[]> {
    this.assertViewer(roles);
    const filter = this.buildFilter(query);
    const rows = await this.dispositionEntryModel
      .find(filter)
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return rows.map((r) => this.toEntryResponse(r));
  }

  async getAllTree(roles: string[]): Promise<DispositionTreeNode[]> {
    this.assertViewer(roles);
    const entries = await this.listTreeEntries();
    return this.buildTree(entries);
  }

  async deleteCampaignArchive(
    roles: string[],
    dto: DeleteDispositionCampaignDto,
  ): Promise<{ deletedCount: number }> {
    if (!roles.includes(SystemRole.SUPER_ADMIN)) {
      throw new ForbiddenException('Only Super Admin can delete disposition archives');
    }

    const filter: Record<string, unknown> = {
      dispositionKind: dto.kind,
    };
    if (dto.year != null) filter.batchYear = dto.year;
    if (dto.month != null) filter.batchMonth = dto.month;

    const campaignKey = dto.campaignKey.trim();
    const campaignMatchers: Record<string, unknown>[] = [];
    if (Types.ObjectId.isValid(campaignKey)) {
      campaignMatchers.push({ rootBatchId: new Types.ObjectId(campaignKey) });
    }
    campaignMatchers.push({ campaignName: campaignKey });
    filter.$or = campaignMatchers;

    const result = await this.dispositionEntryModel.deleteMany(filter).exec();
    return { deletedCount: result.deletedCount ?? 0 };
  }

  private assertViewer(roles: string[]): void {
    const allowed = [
      SystemRole.SUPER_ADMIN,
      SystemRole.ADMIN,
      SystemRole.DB_ADMIN,
    ];
    if (!roles.some((r) => allowed.includes(r as SystemRole))) {
      throw new ForbiddenException('Not allowed to view disposition archive');
    }
  }

  private buildFilter(query: DispositionListQueryDto): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (query.kind) filter.dispositionKind = query.kind;
    if (query.year) filter.batchYear = query.year;
    if (query.month) filter.batchMonth = query.month;
    if (query.employeeId) filter.employeeId = new Types.ObjectId(query.employeeId);
    if (query.rootBatchId) filter.rootBatchId = new Types.ObjectId(query.rootBatchId);
    return filter;
  }

  private async listTreeEntries(): Promise<DispositionEntryResponse[]> {
    const rows = await this.dispositionEntryModel
      .find({})
      .sort({ updatedAt: -1 })
      .lean()
      .exec();
    return rows.map((r) => this.toEntryResponse(r));
  }

  private resolveChannel(
    batch: Batch,
    rootBatch: Record<string, unknown> | null,
  ): QcCampaignChannel {
    const raw =
      (batch.campaignChannel as string | undefined) ??
      (rootBatch?.campaignChannel as string | undefined) ??
      detectCampaignChannel(String(batch.name ?? ''));
    return toQcCampaignChannel(raw);
  }

  private toEntryResponse(doc: Record<string, unknown>): DispositionEntryResponse {
    const kind = doc.dispositionKind as DispositionKind;
    const channel = (doc.campaignChannel as QcCampaignChannel) ?? 'other';
    return {
      id: String(doc._id),
      employeeId: String(doc.employeeId),
      employeeName: doc.employeeName as string | undefined,
      batchId: String(doc.batchId),
      rootBatchId: doc.rootBatchId ? String(doc.rootBatchId) : undefined,
      campaignName: String(doc.campaignName ?? ''),
      campaignChannel: channel,
      channelLabel: QC_CHANNEL_LABELS[channel],
      batchMonth: doc.batchMonth as number | undefined,
      batchYear: doc.batchYear as number | undefined,
      rowIndex: Number(doc.rowIndex ?? 0),
      leadKey: String(doc.leadKey ?? ''),
      leadLabel: doc.leadLabel as string | undefined,
      dispositionKind: kind,
      dispositionLabel: DISPOSITION_KIND_LABELS[kind] ?? kind,
      statusValue: doc.statusValue as string | undefined,
      headers: (doc.headers as string[]) ?? [],
      rowData: (doc.rowData as string[]) ?? [],
      changedColumns: (doc.changedColumns as string[]) ?? [],
      createdAt: (doc.createdAt as Date)?.toISOString?.() ?? '',
      updatedAt: (doc.updatedAt as Date)?.toISOString?.() ?? '',
    };
  }

  private buildTree(entries: DispositionEntryResponse[]): DispositionTreeNode[] {
    const byKind = new Map<DispositionKind, DispositionEntryResponse[]>();
    for (const e of entries) {
      const list = byKind.get(e.dispositionKind) ?? [];
      list.push(e);
      byKind.set(e.dispositionKind, list);
    }

    const kinds: DispositionKind[] = [...DISPOSITION_TREE_KINDS];
    return kinds
      .filter((k) => (byKind.get(k)?.length ?? 0) > 0)
      .map((kind) => {
        const kindEntries = byKind.get(kind) ?? [];
        return {
          key: `kind-${kind}`,
          label: DISPOSITION_KIND_LABELS[kind],
          kind: 'kind' as const,
          dispositionKind: kind,
          count: kindEntries.length,
          children: this.buildYearTree(kindEntries),
        };
      });
  }

  private buildYearTree(entries: DispositionEntryResponse[]): DispositionTreeNode[] {
    const byYear = new Map<number, DispositionEntryResponse[]>();
    for (const e of entries) {
      const y = e.batchYear ?? new Date().getFullYear();
      const list = byYear.get(y) ?? [];
      list.push(e);
      byYear.set(y, list);
    }

    return [...byYear.entries()]
      .sort(([a], [b]) => b - a)
      .map(([year, yearEntries]) => ({
        key: `y-${year}`,
        label: String(year),
        kind: 'year' as const,
        year,
        count: yearEntries.length,
        children: this.buildMonthTree(yearEntries),
      }));
  }

  private buildMonthTree(entries: DispositionEntryResponse[]): DispositionTreeNode[] {
    const byMonth = new Map<number, DispositionEntryResponse[]>();
    for (let m = 1; m <= 12; m++) byMonth.set(m, []);
    for (const e of entries) {
      const m = e.batchMonth ?? 1;
      byMonth.get(m)!.push(e);
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    return [...byMonth.entries()]
      .filter(([, monthEntries]) => monthEntries.length > 0)
      .map(([month, monthEntries]) => ({
        key: `m-${month}`,
        label: monthNames[month - 1] ?? `Month ${month}`,
        kind: 'month' as const,
        month,
        count: monthEntries.length,
        children: this.groupByCampaign(monthEntries),
      }));
  }

  private campaignGroupKey(e: DispositionEntryResponse): string {
    return e.rootBatchId ?? e.campaignName;
  }

  private groupByCampaign(entries: DispositionEntryResponse[]): DispositionTreeNode[] {
    const map = new Map<string, DispositionEntryResponse[]>();
    for (const e of entries) {
      const key = this.campaignGroupKey(e);
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }

    return [...map.entries()]
      .sort(([, a], [, b]) =>
        (a[0]?.campaignName ?? '').localeCompare(b[0]?.campaignName ?? ''),
      )
      .map(([key, list]) => ({
        key: `camp-${key}`,
        label: list[0]?.campaignName ?? 'Campaign',
        kind: 'campaign' as const,
        channel: list[0]?.campaignChannel,
        count: list.length,
        children: this.groupByEmployee(list, key),
      }));
  }

  private groupByEmployee(
    entries: DispositionEntryResponse[],
    campaignKey: string,
  ): DispositionTreeNode[] {
    const map = new Map<string, DispositionEntryResponse[]>();
    for (const e of entries) {
      const list = map.get(e.employeeId) ?? [];
      list.push(e);
      map.set(e.employeeId, list);
    }
    return [...map.entries()].map(([empId, list]) => ({
      key: `emp-${campaignKey}-${empId}`,
      label: list[0]?.employeeName ?? 'Employee',
      kind: 'employee' as const,
      channel: list[0]?.campaignChannel,
      count: list.length,
      entries: list,
    }));
  }

  async createCallbackReminder(
    actorId: string,
    actorName: string | undefined,
    dto: CreateCallbackReminderDto,
  ) {
    const batch = await this.batchModel.findById(dto.batchId).exec();
    if (!batch) throw new NotFoundException('Campaign not found');

    const isAssignee = (batch.sharedWith as Types.ObjectId[])?.some(
      (u) => u.toString() === actorId,
    );
    if (!isAssignee && batch.createdBy?.toString() !== actorId) {
      throw new ForbiddenException('Not allowed to set callback on this campaign');
    }

    const hours = dto.hours as CallbackReminderHours;
    const remindAt = new Date(Date.now() + hours * 60 * 60 * 1000);
    const rootBatchId = await resolveRootBatchId(this.batchModel, batch._id.toString());
    const rootBatch = await this.batchModel.findById(rootBatchId).lean().exec();
    const campaignName = rootBatch?.name ?? batch.name;
    const row = (batch.rows as string[][])?.[dto.rowIndex] ?? [];
    const headers = (batch.headers as string[]) ?? [];
    const leadKey = `${batch._id.toString()}:${dto.rowIndex}`;

    // One active reminder per employee+row — replace prior undismissed
    await this.callbackReminderModel
      .updateMany(
        {
          batchId: batch._id,
          rowIndex: dto.rowIndex,
          employeeId: new Types.ObjectId(actorId),
          status: { $in: ['scheduled', 'due'] },
        },
        { $set: { status: 'dismissed', dismissedAt: new Date() } },
      )
      .exec();

    const created = await this.callbackReminderModel.create({
      employeeId: new Types.ObjectId(actorId),
      employeeName: actorName,
      batchId: batch._id,
      rootBatchId: new Types.ObjectId(rootBatchId),
      campaignName,
      rowIndex: dto.rowIndex,
      leadKey,
      leadLabel: dto.leadLabel || headers.slice(0, 3).map((_, i) => row[i] ?? '').filter(Boolean).join(' · ') || `Row ${dto.rowIndex + 1}`,
      hours,
      description: dto.description.trim(),
      remindAt,
      status: 'scheduled',
    });

    // Drop pending QC — callback is not a lead
    await this.qcEntryModel
      .deleteMany({
        batchId: batch._id,
        rowIndex: dto.rowIndex,
        employeeId: new Types.ObjectId(actorId),
        state: 'pending',
      })
      .exec()
      .catch(() => undefined);

    return this.toReminderResponse(created.toObject() as unknown as Record<string, unknown>);
  }

  /** Promote scheduled → due, return all due undismissed reminders for this employee. */
  async listDueReminders(employeeId: string) {
    const now = new Date();
    await this.callbackReminderModel
      .updateMany(
        {
          employeeId: new Types.ObjectId(employeeId),
          status: 'scheduled',
          remindAt: { $lte: now },
        },
        { $set: { status: 'due' } },
      )
      .exec();

    const rows = await this.callbackReminderModel
      .find({
        employeeId: new Types.ObjectId(employeeId),
        status: 'due',
      })
      .sort({ remindAt: 1 })
      .lean()
      .exec();

    return rows.map((r) => this.toReminderResponse(r as Record<string, unknown>));
  }

  async listMyReminders(employeeId: string) {
    const now = new Date();
    await this.callbackReminderModel
      .updateMany(
        {
          employeeId: new Types.ObjectId(employeeId),
          status: 'scheduled',
          remindAt: { $lte: now },
        },
        { $set: { status: 'due' } },
      )
      .exec();

    const rows = await this.callbackReminderModel
      .find({
        employeeId: new Types.ObjectId(employeeId),
        status: { $in: ['scheduled', 'due'] },
      })
      .sort({ remindAt: 1 })
      .lean()
      .exec();

    return rows.map((r) => this.toReminderResponse(r as Record<string, unknown>));
  }

  async dismissReminder(employeeId: string, reminderId: string) {
    const row = await this.callbackReminderModel
      .findOne({
        _id: reminderId,
        employeeId: new Types.ObjectId(employeeId),
      })
      .exec();
    if (!row) throw new NotFoundException('Reminder not found');
    row.status = 'dismissed';
    row.dismissedAt = new Date();
    await row.save();
    return { ok: true, id: reminderId };
  }

  private toReminderResponse(doc: Record<string, unknown>) {
    return {
      id: String(doc._id),
      employeeId: String(doc.employeeId),
      employeeName: doc.employeeName as string | undefined,
      batchId: String(doc.batchId),
      rootBatchId: doc.rootBatchId ? String(doc.rootBatchId) : undefined,
      campaignName: String(doc.campaignName ?? ''),
      rowIndex: Number(doc.rowIndex ?? 0),
      leadKey: String(doc.leadKey ?? ''),
      leadLabel: doc.leadLabel as string | undefined,
      hours: Number(doc.hours) as 24 | 48,
      description: String(doc.description ?? ''),
      remindAt: doc.remindAt
        ? new Date(doc.remindAt as string | Date).toISOString()
        : '',
      status: String(doc.status ?? 'scheduled'),
      createdAt: doc.createdAt
        ? new Date(doc.createdAt as string | Date).toISOString()
        : undefined,
      dismissedAt: doc.dismissedAt
        ? new Date(doc.dismissedAt as string | Date).toISOString()
        : undefined,
    };
  }
}
