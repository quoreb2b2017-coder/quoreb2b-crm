import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Batch } from '../batches/schemas/batch.schema';
import { resolveRootBatchId } from '../batches/batch-root.util';
import { resolveBatchPeriod } from '../batches/batch-month.util';
import type { LeadRowChange } from '../activity-logs/lead-diff.util';
import { DispositionEntry } from './schemas/disposition-entry.schema';
import { detectCampaignChannel, toQcCampaignChannel } from '../qc/qc-channel.util';
import { statusChangedInColumns } from '../qc/qc-status.util';
import { compactRowDataPoints } from '../qc/qc-row.util';
import {
  DISPOSITION_KIND_LABELS,
  DispositionKind,
} from './disposition.constants';
import {
  classifyDispositionKind,
  isDispositionMarked,
  readRowDisposition,
} from './disposition-status.util';
import { QcCampaignChannel, QC_CHANNEL_LABELS } from '../qc/qc.constants';
import type { DispositionListQueryDto } from './dto/disposition.dto';
import { SystemRole } from '../../common/constants/roles.constant';

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
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
  ) {}

  /** Queue disposition archive when employee picks Do Not Call or Direct Voicemail. */
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
    const period = resolveBatchPeriod(batch as unknown as Record<string, unknown>);
    const campaignName = rootBatch?.name ?? batch.name;

    for (const ch of statusChanges) {
      const row = params.newRows[ch.rowIndex] ?? [];
      const prev = params.oldRows[ch.rowIndex] ?? [];
      const statusValue = readRowDisposition(params.newHeaders, row);
      if (!statusValue || !isDispositionMarked(params.newHeaders, row)) continue;

      const dispositionKind = classifyDispositionKind(statusValue);
      if (!dispositionKind) continue;

      const compact = compactRowDataPoints(params.newHeaders, row);
      if (compact.headers.length === 0) continue;

      try {
        await this.dispositionEntryModel.findOneAndUpdate(
          {
            batchId: batch._id,
            rowIndex: ch.rowIndex,
            employeeId: new Types.ObjectId(actorId),
            dispositionKind,
          },
          {
            $set: {
              employeeName: params.actorName,
              rootBatchId: new Types.ObjectId(rootBatchId),
              campaignName,
              campaignChannel: channel,
              batchMonth: period.batchMonth,
              batchYear: period.batchYear,
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

    const kinds: DispositionKind[] = ['do_not_call', 'direct_voicemail'];
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
}
