import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Batch } from '../batches/schemas/batch.schema';
import { resolveRootBatchId } from '../batches/batch-root.util';
import { resolveBatchPeriod } from '../batches/batch-month.util';
import type { LeadRowChange } from '../activity-logs/lead-diff.util';
import { QcEntry } from './schemas/qc-entry.schema';
import { detectCampaignChannel, toQcCampaignChannel } from './qc-channel.util';
import { readRowStatus, statusChangedInColumns, isLeadMarkedForQc } from './qc-status.util';
import { compactRowDataPoints, buildMergedQcSheet, appendMergedQcSheet, appendQcSheets } from './qc-row.util';
import { QcCampaignChannel, QC_CHANNEL_LABELS, QcDecision, QC_DECISION_LABELS } from './qc.constants';
import type { QcListQueryDto, QcMergeDto, QcDecisionDto } from './dto/qc.dto';
import { SystemRole } from '../../common/constants/roles.constant';

export interface QcEntryResponse {
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
  statusValue?: string;
  headers: string[];
  rowData: string[];
  changedColumns: string[];
  state: string;
  qcDecision?: string;
  qcDecisionLabel?: string;
  returnedToEmployee?: boolean;
  mergedReadyBatchId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface QcTreeNode {
  key: string;
  label: string;
  kind: 'year' | 'month' | 'channel' | 'campaign' | 'employee' | 'ready';
  count?: number;
  channel?: QcCampaignChannel;
  year?: number;
  month?: number;
  children?: QcTreeNode[];
  entries?: QcEntryResponse[];
}

@Injectable()
export class QcService {
  private readonly logger = new Logger(QcService.name);

  constructor(
    @InjectModel(QcEntry.name) private qcEntryModel: Model<QcEntry>,
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
  ) {}

  /** Queue QC when an assigned employee updates lead status (never touches master file). */
  async enqueueFromBatchUpdate(params: {
    batch: Batch;
    actorId: string;
    actorName?: string;
    actorRoles: string[];
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
      const statusValue = readRowStatus(params.newHeaders, row);
      if (!statusValue || !isLeadMarkedForQc(params.newHeaders, row)) continue;

      const compact = compactRowDataPoints(params.newHeaders, row);
      if (compact.headers.length === 0) continue;

      try {
        await this.qcEntryModel.findOneAndUpdate(
          {
            batchId: batch._id,
            rowIndex: ch.rowIndex,
            employeeId: new Types.ObjectId(actorId),
            state: 'pending',
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
          `QC enqueue failed row ${ch.rowIndex}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  async getMyEntries(userId: string, query: QcListQueryDto): Promise<QcEntryResponse[]> {
    const filter: Record<string, unknown> = {
      employeeId: new Types.ObjectId(userId),
      state: query.state ?? 'pending',
    };
    if (query.year) filter.batchYear = query.year;
    if (query.month) filter.batchMonth = query.month;
    if (query.channel) filter.campaignChannel = query.channel;

    const rows = await this.qcEntryModel.find(filter).sort({ updatedAt: -1 }).lean().exec();
    return rows.map((r) => this.toEntryResponse(r));
  }

  async getAllEntries(
    actorId: string,
    roles: string[],
    query: QcListQueryDto,
  ): Promise<QcEntryResponse[]> {
    this.assertAdmin(roles);
    const filter: Record<string, unknown> = { state: query.state ?? 'pending' };
    if (query.year) filter.batchYear = query.year;
    if (query.month) filter.batchMonth = query.month;
    if (query.channel) filter.campaignChannel = query.channel;
    if (query.employeeId) filter.employeeId = new Types.ObjectId(query.employeeId);
    if (query.rootBatchId) filter.rootBatchId = new Types.ObjectId(query.rootBatchId);

    const rows = await this.qcEntryModel.find(filter).sort({ updatedAt: -1 }).lean().exec();
    return rows.map((r) => this.toEntryResponse(r));
  }

  async getMyTree(userId: string): Promise<QcTreeNode[]> {
    const entries = await this.listTreeEntries({ employeeId: userId });
    return this.buildPendingTree(entries, false);
  }

  async getAllTree(roles: string[]): Promise<QcTreeNode[]> {
    this.assertAdmin(roles);
    const entries = await this.listTreeEntries({ adminMode: true });
    return this.buildPendingTree(entries, true);
  }

  /** Pending + merged for folder views; admin excludes TBD/DQ routed to employee. */
  private async listTreeEntries(filter: {
    employeeId?: string;
    adminMode?: boolean;
  }): Promise<QcEntryResponse[]> {
    const query: Record<string, unknown> = {
      state: { $in: ['pending', 'merged'] },
    };
    if (filter.employeeId) {
      query.employeeId = new Types.ObjectId(filter.employeeId);
      query.$or = [
        { state: 'merged' },
        { state: 'pending', returnedToEmployee: { $ne: true } },
        {
          state: 'pending',
          returnedToEmployee: true,
          qcDecision: { $in: ['tbd', 'disqualified'] },
        },
      ];
    } else if (filter.adminMode) {
      query.$nor = [
        {
          state: 'pending',
          returnedToEmployee: true,
          qcDecision: { $in: ['tbd', 'disqualified'] },
        },
      ];
    }

    const rows = await this.qcEntryModel.find(query).sort({ updatedAt: -1 }).lean().exec();
    return rows.map((r) => this.toEntryResponse(r));
  }

  async mergeToReady(
    actor: { id: string; email?: string; name?: string },
    roles: string[],
    dto: QcMergeDto,
  ) {
    this.assertAdmin(roles);
    if (!dto.entryIds.length) {
      throw new BadRequestException('Select at least one QC entry to merge');
    }

    const entries = await this.qcEntryModel
      .find({
        _id: { $in: dto.entryIds.map((id) => new Types.ObjectId(id)) },
        state: 'pending',
      })
      .lean()
      .exec();

    if (entries.length !== dto.entryIds.length) {
      throw new BadRequestException('Some QC entries are missing or already merged');
    }

    const channel = dto.channel as QcCampaignChannel;
    const mismatched = entries.filter((e) => e.campaignChannel !== channel);
    if (mismatched.length) {
      throw new BadRequestException(
        `All entries must be ${QC_CHANNEL_LABELS[channel]} — cannot mix VOIP with GPS`,
      );
    }

    const campaignKeys = new Set(
      entries.map((e) =>
        e.rootBatchId ? String(e.rootBatchId) : String(e.campaignName ?? '').trim(),
      ),
    );
    if (campaignKeys.size > 1) {
      throw new BadRequestException(
        'Merge one campaign at a time — select leads from a single campaign folder',
      );
    }

    const campaignName = String(entries[0].campaignName ?? '').trim();
    if (!campaignName) {
      throw new BadRequestException('Campaign name is missing on QC entries');
    }

    const newChunk = buildMergedQcSheet(entries);
    if (newChunk.headers.length === 0) {
      throw new BadRequestException('No data points to merge');
    }

    const name = dto.name?.trim() || campaignName;
    const rootBatchId = entries[0].rootBatchId;

    const existingList = await this.findReadyBatchesForCampaign({
      rootBatchId: rootBatchId ? new Types.ObjectId(rootBatchId) : undefined,
      campaignName: name,
    });

    let readyBatch: Batch;
    let isNewFile = false;

    if (existingList.length > 0) {
      readyBatch = await this.consolidateReadyBatches(existingList, {
        campaignName: name,
        rootBatchId: rootBatchId ? new Types.ObjectId(rootBatchId) : undefined,
      });
      const merged = appendMergedQcSheet(
        { headers: readyBatch.headers ?? [], rows: readyBatch.rows ?? [] },
        entries,
      );
      readyBatch.headers = merged.headers;
      readyBatch.rows = merged.rows;
      readyBatch.rowCount = merged.rows.length;
      readyBatch.columnCount = merged.headers.length;
      readyBatch.name = name;
      if (rootBatchId && !readyBatch.sourceBatchId) {
        readyBatch.sourceBatchId = new Types.ObjectId(rootBatchId);
      }
      readyBatch = await readyBatch.save();
    } else {
      isNewFile = true;
      readyBatch = await this.batchModel.create({
        name,
        headers: [...newChunk.headers],
        rows: newChunk.rows,
        rowCount: newChunk.rows.length,
        columnCount: newChunk.headers.length,
        batchKind: 'qc_ready',
        campaignChannel: channel,
        batchMonth: dto.month,
        batchYear: dto.year,
        sourceBatchId: rootBatchId ? new Types.ObjectId(rootBatchId) : undefined,
        createdBy: new Types.ObjectId(actor.id),
        createdByEmail: actor.email,
        createdByName: actor.name,
        sharedWith: [],
      });
    }

    await this.qcEntryModel.updateMany(
      { _id: { $in: entries.map((e) => e._id) } },
      {
        $set: {
          state: 'merged',
          qcDecision: 'qualified',
          mergedReadyBatchId: readyBatch._id,
        },
      },
    );

    return {
      readyBatchId: readyBatch._id.toString(),
      name: readyBatch.name,
      campaignName,
      rowCount: readyBatch.rowCount,
      channel,
      year: readyBatch.batchYear ?? dto.year,
      month: readyBatch.batchMonth ?? dto.month,
      mergedCount: entries.length,
      isNewFile,
    };
  }

  async rejectEntries(roles: string[], entryIds: string[]) {
    this.assertAdmin(roles);
    const result = await this.qcEntryModel.updateMany(
      { _id: { $in: entryIds.map((id) => new Types.ObjectId(id)) }, state: 'pending' },
      { $set: { state: 'rejected' } },
    );
    return { rejected: result.modifiedCount };
  }

  /** Super Admin sets Qualified → Ready QC; TBD / Disqualified → employee My QC */
  async applyDecision(
    actor: { id: string; email?: string; name?: string },
    roles: string[],
    dto: QcDecisionDto,
  ) {
    this.assertAdmin(roles);
    const decision = dto.decision as QcDecision;
    if (!['qualified', 'tbd', 'disqualified'].includes(decision)) {
      throw new BadRequestException('Invalid QC decision');
    }

    const entry = await this.qcEntryModel.findOne({
      _id: new Types.ObjectId(dto.entryId),
      state: 'pending',
      returnedToEmployee: { $ne: true },
    });
    if (!entry) {
      throw new BadRequestException('QC entry not found or already reviewed');
    }

    if (decision === 'qualified') {
      const channel = entry.campaignChannel as QcCampaignChannel;
      const mergeResult = await this.mergeToReady(actor, roles, {
        entryIds: [dto.entryId],
        channel,
        year: entry.batchYear ?? new Date().getFullYear(),
        month: entry.batchMonth ?? new Date().getMonth() + 1,
        name: entry.campaignName,
      });
      return {
        decision,
        decisionLabel: QC_DECISION_LABELS[decision],
        routed: 'ready_qc' as const,
        merge: mergeResult,
      };
    }

    entry.qcDecision = decision;
    entry.returnedToEmployee = true;
    await entry.save();

    return {
      decision,
      decisionLabel: QC_DECISION_LABELS[decision],
      routed: 'employee_my_qc' as const,
      employeeId: entry.employeeId.toString(),
      employeeName: entry.employeeName,
    };
  }

  async listReadyBatches(roles: string[], query: QcListQueryDto) {
    this.assertAdmin(roles);
    const filter: Record<string, unknown> = { batchKind: 'qc_ready' };
    if (query.year) filter.batchYear = query.year;
    if (query.month) filter.batchMonth = query.month;
    if (query.channel) filter.campaignChannel = query.channel;

    const batches = await this.batchModel
      .find(filter)
      .sort({ createdAt: -1 })
      .select('-rows')
      .lean()
      .exec();

    return batches.map((b) => ({
      id: String(b._id),
      name: b.name,
      sourceBatchId: b.sourceBatchId ? String(b.sourceBatchId) : undefined,
      campaignChannel: b.campaignChannel ?? 'other',
      channelLabel: QC_CHANNEL_LABELS[(b.campaignChannel as QcCampaignChannel) ?? 'other'],
      batchMonth: b.batchMonth,
      batchYear: b.batchYear,
      rowCount: b.rowCount ?? 0,
      createdAt: String((b as Record<string, unknown>).createdAt ?? ''),
      createdByName: b.createdByName,
    }));
  }

  async getReadyTree(roles: string[]): Promise<QcTreeNode[]> {
    this.assertAdmin(roles);
    await this.consolidateAllDuplicateReadyBatches();
    const batches = await this.listReadyBatches(roles, {});
    return this.buildReadyTree(batches);
  }

  async pendingCountForEmployee(userId: string): Promise<number> {
    return this.qcEntryModel.countDocuments({
      employeeId: new Types.ObjectId(userId),
      state: 'pending',
    });
  }

  async pendingCountForAdmin(): Promise<number> {
    return this.qcEntryModel.countDocuments({ state: 'pending' });
  }

  private resolveChannel(
    batch: Batch | Record<string, unknown>,
    rootBatch: Record<string, unknown> | null | undefined,
  ): QcCampaignChannel {
    const b = batch as Record<string, unknown>;
    const r = rootBatch as Record<string, unknown> | null | undefined;
    return toQcCampaignChannel(
      detectCampaignChannel(
        String(r?.name ?? b.name ?? ''),
        (b.campaignChannel as string) ?? (r?.campaignChannel as string),
      ),
    );
  }

  private assertAdmin(roles: string[]) {
    if (
      !roles.includes(SystemRole.SUPER_ADMIN) &&
      !roles.includes(SystemRole.ADMIN)
    ) {
      throw new ForbiddenException('Admin access required');
    }
  }

  private toEntryResponse(doc: Record<string, unknown>): QcEntryResponse {
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
      statusValue: doc.statusValue as string | undefined,
      headers: (doc.headers as string[]) ?? [],
      rowData: (doc.rowData as string[]) ?? [],
      changedColumns: (doc.changedColumns as string[]) ?? [],
      state: String(doc.state ?? 'pending'),
      qcDecision: doc.qcDecision as string | undefined,
      qcDecisionLabel: doc.qcDecision
        ? QC_DECISION_LABELS[doc.qcDecision as QcDecision]
        : undefined,
      returnedToEmployee: Boolean(doc.returnedToEmployee),
      mergedReadyBatchId: doc.mergedReadyBatchId
        ? String(doc.mergedReadyBatchId)
        : undefined,
      createdAt: (doc.createdAt as Date)?.toISOString?.() ?? '',
      updatedAt: (doc.updatedAt as Date)?.toISOString?.() ?? '',
    };
  }

  private buildPendingTree(entries: QcEntryResponse[], adminMode: boolean): QcTreeNode[] {
    const byYear = new Map<number, QcEntryResponse[]>();
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
        children: this.buildMonthCampaignTree(yearEntries, adminMode),
      }));
  }

  private buildMonthCampaignTree(
    entries: QcEntryResponse[],
    adminMode: boolean,
  ): QcTreeNode[] {
    const byMonth = new Map<number, QcEntryResponse[]>();
    for (let m = 1; m <= 12; m++) byMonth.set(m, []);
    for (const e of entries) {
      const m = e.batchMonth ?? 1;
      byMonth.get(m)!.push(e);
    }

    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    return [...byMonth.entries()].map(([month, monthEntries]) => ({
      key: `m-${month}`,
      label: monthNames[month - 1] ?? `Month ${month}`,
      kind: 'month' as const,
      month,
      count: monthEntries.length,
      children:
        monthEntries.length === 0
          ? []
          : this.groupByCampaign(monthEntries, adminMode),
    }));
  }

  private campaignGroupKey(e: QcEntryResponse): string {
    return e.rootBatchId ?? e.campaignName;
  }

  private groupByCampaign(
    entries: QcEntryResponse[],
    withEmployees: boolean,
  ): QcTreeNode[] {
    const map = new Map<string, QcEntryResponse[]>();
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
      .map(([key, list]) => {
        const channel = list[0]?.campaignChannel ?? 'other';
        return {
          key: `camp-${key}`,
          label: list[0]?.campaignName ?? 'Campaign',
          kind: 'campaign' as const,
          channel,
          count: list.length,
          entries: withEmployees ? undefined : list,
          children: withEmployees
            ? this.groupByEmployee(list, key)
            : undefined,
        };
      });
  }

  private groupByEmployee(
    entries: QcEntryResponse[],
    campaignKey: string,
  ): QcTreeNode[] {
    const map = new Map<string, QcEntryResponse[]>();
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

  private async findReadyBatchesForCampaign(params: {
    rootBatchId?: Types.ObjectId;
    campaignName: string;
  }): Promise<Batch[]> {
    const { rootBatchId, campaignName } = params;
    const or: Record<string, unknown>[] = [{ name: campaignName }];

    if (rootBatchId) {
      or.push({ sourceBatchId: rootBatchId });
      const linkedIds = await this.qcEntryModel.distinct('mergedReadyBatchId', {
        rootBatchId,
        mergedReadyBatchId: { $exists: true, $ne: null },
      });
      if (linkedIds.length) {
        or.push({ _id: { $in: linkedIds } });
      }
    }

    const seen = new Set<string>();
    const batches = await this.batchModel
      .find({ batchKind: 'qc_ready', $or: or })
      .sort({ updatedAt: -1 })
      .exec();

    return batches.filter((b) => {
      const id = b._id.toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  private async consolidateReadyBatches(
    batches: Batch[],
    opts: { campaignName: string; rootBatchId?: Types.ObjectId },
  ): Promise<Batch> {
    if (batches.length === 1) {
      const only = batches[0];
      if (opts.rootBatchId && !only.sourceBatchId) {
        only.sourceBatchId = opts.rootBatchId;
      }
      if (only.name !== opts.campaignName) only.name = opts.campaignName;
      return only.save();
    }

    const [primary, ...rest] = batches;
    let combined = { headers: primary.headers ?? [], rows: primary.rows ?? [] };

    for (const other of rest) {
      combined = appendQcSheets(combined, {
        headers: other.headers ?? [],
        rows: other.rows ?? [],
      });
    }

    primary.headers = combined.headers;
    primary.rows = combined.rows;
    primary.rowCount = combined.rows.length;
    primary.columnCount = combined.headers.length;
    primary.name = opts.campaignName;
    if (opts.rootBatchId) primary.sourceBatchId = opts.rootBatchId;

    const deleteIds = rest.map((b) => b._id);
    await this.qcEntryModel.updateMany(
      { mergedReadyBatchId: { $in: deleteIds } },
      { $set: { mergedReadyBatchId: primary._id } },
    );
    await this.batchModel.deleteMany({ _id: { $in: deleteIds } });

    return primary.save();
  }

  /** Merge duplicate Ready QC files (legacy merges) into one per campaign. */
  private async consolidateAllDuplicateReadyBatches(): Promise<void> {
    const all = await this.batchModel.find({ batchKind: 'qc_ready' }).sort({ updatedAt: -1 }).exec();
    if (all.length < 2) return;

    const batchToRoot = new Map<string, string>();
    for (const b of all) {
      if (b.sourceBatchId) {
        batchToRoot.set(b._id.toString(), b.sourceBatchId.toString());
      }
    }

    const unmapped = all.filter((b) => !batchToRoot.has(b._id.toString()));
    if (unmapped.length) {
      const links = await this.qcEntryModel
        .find({ mergedReadyBatchId: { $in: unmapped.map((b) => b._id) } })
        .select('mergedReadyBatchId rootBatchId')
        .lean()
        .exec();
      for (const link of links) {
        const batchId = link.mergedReadyBatchId?.toString();
        const rootId = link.rootBatchId?.toString();
        if (batchId && rootId) batchToRoot.set(batchId, rootId);
      }
    }

    const groups = new Map<string, Batch[]>();
    for (const b of all) {
      const key = batchToRoot.get(b._id.toString()) ?? `name:${b.name.trim().toLowerCase()}`;
      const list = groups.get(key) ?? [];
      list.push(b);
      groups.set(key, list);
    }

    for (const [, group] of groups) {
      if (group.length < 2) continue;
      const primary = group[0];
      const rootId = batchToRoot.get(primary._id.toString());
      const campaignName =
        group.find((b) => !b.name.toLowerCase().startsWith('ready qc'))?.name ?? primary.name;
      await this.consolidateReadyBatches(group, {
        campaignName,
        rootBatchId: rootId ? new Types.ObjectId(rootId) : undefined,
      });
    }
  }

  private buildReadyTree(
    batches: Array<{
      id: string;
      name: string;
      sourceBatchId?: string;
      campaignChannel: string;
      channelLabel: string;
      batchMonth?: number;
      batchYear?: number;
      rowCount: number;
    }>,
  ): QcTreeNode[] {
    const currentYear = new Date().getFullYear();
    const byYear = new Map<number, typeof batches>();
    for (const b of batches) {
      const y = b.batchYear ?? currentYear;
      const list = byYear.get(y) ?? [];
      list.push(b);
      byYear.set(y, list);
    }

    const years = new Set<number>([currentYear, ...byYear.keys()]);
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];

    return [...years]
      .sort((a, b) => b - a)
      .map((year) => {
        const yearBatches = byYear.get(year) ?? [];
        return {
          key: `ready-y-${year}`,
          label: String(year),
          kind: 'year' as const,
          year,
          count: yearBatches.length,
          children: Array.from({ length: 12 }, (_, i) => i + 1).map((month) => {
            const monthBatches = yearBatches.filter((b) => (b.batchMonth ?? 1) === month);
            const byCampaign = new Map<string, (typeof monthBatches)[0]>();
            for (const b of monthBatches) {
              const campKey = b.sourceBatchId ?? b.name.trim().toLowerCase();
              const prev = byCampaign.get(campKey);
              if (!prev || b.rowCount > prev.rowCount) {
                byCampaign.set(campKey, b);
              }
            }

            return {
              key: `ready-m-${year}-${month}`,
              label: monthNames[month - 1] ?? `Month ${month}`,
              kind: 'month' as const,
              month,
              year,
              count: byCampaign.size,
              children: [...byCampaign.values()]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((b) => ({
                  key: `ready-${b.id}`,
                  label: b.name,
                  kind: 'ready' as const,
                  channel: b.campaignChannel as QcCampaignChannel,
                  year,
                  month,
                  count: b.rowCount,
                })),
            };
          }),
        };
      });
  }

  async getReadyBatch(roles: string[], batchId: string) {
    this.assertAdmin(roles);
    if (!Types.ObjectId.isValid(batchId)) {
      throw new BadRequestException('Invalid batch id');
    }
    const batch = await this.batchModel
      .findOne({ _id: batchId, batchKind: 'qc_ready' })
      .lean()
      .exec();
    if (!batch) throw new NotFoundException('Ready QC file not found');

    const channel = (batch.campaignChannel as QcCampaignChannel) ?? 'other';
    return {
      id: String(batch._id),
      name: batch.name,
      headers: (batch.headers as string[]) ?? [],
      rows: (batch.rows as string[][]) ?? [],
      rowCount: batch.rowCount ?? 0,
      columnCount: batch.columnCount ?? 0,
      campaignChannel: channel,
      channelLabel: QC_CHANNEL_LABELS[channel],
      batchMonth: batch.batchMonth,
      batchYear: batch.batchYear,
      createdAt: String((batch as Record<string, unknown>).createdAt ?? ''),
      createdByName: batch.createdByName,
    };
  }

  /** Remove QC queue entries when campaign batches are deleted */
  async deleteEntriesForBatches(batchIds: Types.ObjectId[]): Promise<number> {
    if (!batchIds.length) return 0;
    const result = await this.qcEntryModel
      .deleteMany({
        $or: [{ batchId: { $in: batchIds } }, { rootBatchId: { $in: batchIds } }],
      })
      .exec();
    return result.deletedCount ?? 0;
  }
}
