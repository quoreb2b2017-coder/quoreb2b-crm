import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Batch } from './schemas/batch.schema';
import { ActivityLog } from '../activity-logs/schemas/activity-log.schema';
import { UsersRepository } from '../users/users.repository';
import { SystemRole } from '../../common/constants/roles.constant';
import { collectBatchTree } from './batch-root.util';
import {
  buildMemberPerformance,
  type MemberPerformanceResult,
} from './batch-member-performance.util';
import type { BatchLeadSnapshot } from '../activity-logs/lead-activity-report.util';
import type { ActivityLogRow } from '../activity-logs/employee-report.util';
import { monthLabel, resolveBatchPeriod } from './batch-month.util';
import {
  type ActivitySummary,
  type BatchHierarchyResult,
  type DistributedBatchRef,
  type HierarchyActionItem,
  type HierarchyMemberNode,
  type HierarchyShareEvent,
  type HierarchyShareRecipient,
  type HierarchyUserRef,
  displayUserName,
  primaryRole,
} from './batch-hierarchy.util';

const BATCH_ACTIONS = ['LEAD_VIEW', 'LEAD_TOUCH', 'LEAD_UPDATE', 'BATCH_CREATE', 'BATCH_SHARE'];

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function docIsoDate(doc: Record<string, unknown>, key = 'createdAt'): string {
  const v = doc[key];
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') return v;
  return '';
}

function mergeActivity(a: ActivitySummary, b: ActivitySummary): ActivitySummary {
  const last =
    a.lastActivityAt && b.lastActivityAt
      ? a.lastActivityAt > b.lastActivityAt
        ? a.lastActivityAt
        : b.lastActivityAt
      : a.lastActivityAt ?? b.lastActivityAt;
  return {
    views: a.views + b.views,
    touches: a.touches + b.touches,
    updates: a.updates + b.updates,
    batchCreates: a.batchCreates + b.batchCreates,
    shares: a.shares + b.shares,
    lastActivityAt: last,
  };
}

@Injectable()
export class BatchHierarchyService {
  constructor(
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
    @InjectModel(ActivityLog.name) private logModel: Model<ActivityLog>,
    private usersRepository: UsersRepository,
  ) {}

  async getHierarchy(
    batchId: string,
    actorId: string,
    roles: string[] = [],
  ): Promise<BatchHierarchyResult> {
    if (!Types.ObjectId.isValid(batchId)) {
      throw new NotFoundException('Campaign not found');
    }

    const treeDocs = await collectBatchTree(this.batchModel, batchId);
    const rootDoc = treeDocs[0];
    if (!rootDoc) throw new NotFoundException('Batch not found');

    const rootId = String(rootDoc._id);
    const isAdmin =
      roles.includes(SystemRole.ADMIN) || roles.includes(SystemRole.SUPER_ADMIN);
    const isOwner = rootDoc.createdBy?.toString() === actorId;
    const isShared = (rootDoc.sharedWith as Types.ObjectId[])?.some(
      (u) => u.toString() === actorId,
    );
    if (!isAdmin && !isOwner && !isShared) {
      throw new ForbiddenException('Access denied');
    }

    const childDocs = treeDocs.slice(1);
    const allBatchIds = treeDocs.map((d) => String(d._id));

    const userIdSet = new Set<string>();
    if (rootDoc.createdBy) userIdSet.add(rootDoc.createdBy.toString());
    for (const doc of treeDocs) {
      if (doc.createdBy) userIdSet.add(doc.createdBy.toString());
      for (const uid of (doc.sharedWith as Types.ObjectId[]) ?? []) {
        userIdSet.add(uid.toString());
      }
    }

    const users = await this.usersRepository.findByIds([...userIdSet]);
    const userMap = new Map(
      users.map((u) => {
        const o = (u.toObject ? u.toObject() : u) as unknown as Record<string, unknown>;
        const id = String((o as { _id: Types.ObjectId })._id);
        const r = ((o as { roles?: string[] }).roles ?? []) as string[];
        return [
          id,
          {
            id,
            name: displayUserName(
              (o as { firstName?: string }).firstName,
              (o as { lastName?: string }).lastName,
              (o as { email?: string }).email,
            ),
            email: String((o as { email?: string }).email ?? ''),
            employeeId: (o as { employeeId?: string }).employeeId,
            role: primaryRole(r),
            roles: r,
          },
        ] as const;
      }),
    );

    const { summaryByUser } = await this.loadActivityMaps(rootId, allBatchIds);
    const shareEvents = await this.loadShareEvents(rootId, allBatchIds, userMap);

    const rootPlain = rootDoc as Record<string, unknown>;
    const period = resolveBatchPeriod({
      batchMonth: rootDoc.batchMonth as number | undefined,
      batchYear: rootDoc.batchYear as number | undefined,
      createdAt: rootPlain.createdAt as Date | string | undefined,
    });

    const rootRowCount = (rootDoc.rowCount as number) ?? 0;
    const creatorRef = rootDoc.createdBy
      ? this.toUserRef(userMap.get(rootDoc.createdBy.toString()))
      : undefined;

    const childRefs: DistributedBatchRef[] = childDocs.map((c) => {
      const cd = c as unknown as Record<string, unknown>;
      const src = c.sourceBatchId?.toString();
      return {
        id: String(c._id),
        name: String(c.name),
        rowCount: (c.rowCount as number) ?? 0,
        columnCount: (c.columnCount as number) ?? 0,
        createdAt: docIsoDate(cd),
        sharedWithCount: ((c.sharedWith as Types.ObjectId[]) ?? []).length,
        sourceBatchId: src,
      };
    });

    const employeesUnderDba = new Map<string, Map<string, HierarchyMemberNode>>();
    const dbAdminIds = new Set<string>();

    for (const uid of (rootDoc.sharedWith as Types.ObjectId[]) ?? []) {
      const u = userMap.get(uid.toString());
      if (u?.role === 'db_admin') dbAdminIds.add(uid.toString());
    }
    for (const c of childDocs) {
      const creator = c.createdBy?.toString();
      if (creator) dbAdminIds.add(creator);
    }
    for (const ev of shareEvents) {
      if (ev.sharerRole === 'db_admin') dbAdminIds.add(ev.sharerId);
    }

    const upsertEmployee = (
      dbaId: string,
      empKey: string,
      node: HierarchyMemberNode,
    ) => {
      if (!employeesUnderDba.has(dbaId)) employeesUnderDba.set(dbaId, new Map());
      const map = employeesUnderDba.get(dbaId)!;
      const existing = map.get(empKey);
      if (!existing) {
        map.set(empKey, node);
        return;
      }
      existing.dataRows += node.dataRows;
      existing.distributedBatches.push(...node.distributedBatches);
      existing.activity = mergeActivity(existing.activity, node.activity);
    };

    for (const c of childDocs) {
      const dbaId = c.createdBy?.toString() ?? '';
      if (!dbaId || !dbAdminIds.has(dbaId)) continue;
      const cd = c as unknown as Record<string, unknown>;
      const batchRef: DistributedBatchRef = {
        id: String(c._id),
        name: String(c.name),
        rowCount: (c.rowCount as number) ?? 0,
        columnCount: (c.columnCount as number) ?? 0,
        createdAt: docIsoDate(cd),
        sharedWithCount: ((c.sharedWith as Types.ObjectId[]) ?? []).length,
        sourceBatchId: c.sourceBatchId?.toString(),
      };
      for (const empId of (c.sharedWith as Types.ObjectId[]) ?? []) {
        const empKey = empId.toString();
        const emp = userMap.get(empKey);
        if (!emp || emp.role !== 'employee') continue;
        upsertEmployee(dbaId, empKey, {
          user: this.toUserRef(emp),
          dataRows: batchRef.rowCount,
          accessType: 'distributed_batch',
          distributedBatches: [batchRef],
          activity: summaryByUser.get(empKey) ?? emptySummary(),
          team: [],
        });
      }
    }

    for (const ev of shareEvents) {
      if (ev.sharerRole !== 'db_admin') continue;
      const batchRef = childRefs.find((b) => b.id === ev.batchId);
      const rows = batchRef?.rowCount ?? ev.rowCount;
      for (const rec of ev.recipients) {
        if (rec.role !== 'employee') continue;
        const emp = userMap.get(rec.id);
        upsertEmployee(ev.sharerId, rec.id, {
          user: this.toUserRef(emp ?? { ...rec, role: 'employee' }),
          dataRows: rows,
          accessType: 'distributed_batch',
          distributedBatches: batchRef ? [batchRef] : [],
          activity: summaryByUser.get(rec.id) ?? emptySummary(),
          team: [],
        });
      }
    }

    const tree: HierarchyMemberNode[] = [];
    for (const dbaId of dbAdminIds) {
      if (!dbaId || dbaId === rootDoc.createdBy?.toString()) continue;
      const u = userMap.get(dbaId);
      if (!u || u.role !== 'db_admin') continue;

      const distributed = childRefs.filter(
        (c) => childDocs.find((d) => String(d._id) === c.id)?.createdBy?.toString() === dbaId,
      );
      const dataRows = distributed.reduce((s, b) => s + b.rowCount, 0) || rootRowCount;
      const teamMap = employeesUnderDba.get(dbaId);
      const team = teamMap ? [...teamMap.values()] : [];
      team.sort((a, b) => b.dataRows - a.dataRows);

      const dbaShares = shareEvents.filter((e) => e.sharerId === dbaId);

      tree.push({
        user: this.toUserRef(u),
        dataRows: distributed.length > 0 ? dataRows : rootRowCount,
        accessType: distributed.length > 0 ? 'distributed_batch' : 'full_share',
        distributedBatches: distributed,
        activity: summaryByUser.get(dbaId) ?? emptySummary(),
        team,
        shareEvents: dbaShares,
      });
    }

    const attributedEmployees = new Set<string>();
    for (const m of employeesUnderDba.values()) {
      for (const k of m.keys()) attributedEmployees.add(k);
    }

    const directEmployees: HierarchyMemberNode[] = [];
    for (const doc of treeDocs) {
      for (const uid of (doc.sharedWith as Types.ObjectId[]) ?? []) {
        const empKey = uid.toString();
        if (attributedEmployees.has(empKey)) continue;
        const u = userMap.get(empKey);
        if (!u || u.role !== 'employee') continue;
        attributedEmployees.add(empKey);
        const rows =
          doc._id.toString() === rootId
            ? rootRowCount
            : (doc.rowCount as number) ?? 0;
        directEmployees.push({
          user: this.toUserRef(u),
          dataRows: rows,
          accessType: doc._id.toString() === rootId ? 'full_share' : 'distributed_batch',
          distributedBatches:
            doc._id.toString() === rootId
              ? []
              : [
                  childRefs.find((b) => b.id === String(doc._id)) ?? {
                    id: String(doc._id),
                    name: String(doc.name),
                    rowCount: rows,
                    columnCount: (doc.columnCount as number) ?? 0,
                    createdAt: docIsoDate(doc as Record<string, unknown>),
                    sharedWithCount: ((doc.sharedWith as Types.ObjectId[]) ?? []).length,
                  },
                ],
          activity: summaryByUser.get(empKey) ?? emptySummary(),
          team: [],
        });
      }
    }

    tree.sort((a, b) => b.dataRows - a.dataRows);
    directEmployees.sort((a, b) => b.dataRows - a.dataRows);
    shareEvents.sort((a, b) => (b.occurredAt > a.occurredAt ? 1 : -1));

    return {
      root: {
        id: rootId,
        name: String(rootDoc.name),
        rowCount: rootRowCount,
        columnCount: (rootDoc.columnCount as number) ?? 0,
        monthLabel: monthLabel(period.batchMonth),
        batchMonth: period.batchMonth,
        batchYear: period.batchYear,
        createdAt: docIsoDate(rootPlain),
        createdByName: rootDoc.createdByName as string | undefined,
      },
      creator: creatorRef,
      tree,
      directEmployees,
      shareEvents,
    };
  }

  async getMemberPerformance(
    batchId: string,
    memberUserId: string,
    actorId: string,
    roles: string[] = [],
  ): Promise<MemberPerformanceResult> {
    const h = await this.getHierarchy(batchId, actorId, roles);
    const treeDocs = await collectBatchTree(this.batchModel, h.root.id);
    const allBatchIds = treeDocs.map((d) => String(d._id));

    const user = await this.usersRepository.findById(memberUserId);
    if (!user) throw new NotFoundException('User not found');
    const o = (user.toObject ? user.toObject() : user) as unknown as Record<string, unknown>;
    const userRef = {
      id: memberUserId,
      name: displayUserName(
        (o as { firstName?: string }).firstName,
        (o as { lastName?: string }).lastName,
        (o as { email?: string }).email,
      ),
      email: String((o as { email?: string }).email ?? ''),
      role: primaryRole(((o as { roles?: string[] }).roles ?? []) as string[]),
    };

    const batchesWithRows = await this.batchModel
      .find({ _id: { $in: allBatchIds.map((id) => new Types.ObjectId(id)) } })
      .select('name headers rows sharedWith')
      .lean()
      .exec();

    const leadBatches: BatchLeadSnapshot[] = [];
    for (const b of batchesWithRows) {
      const shared = ((b.sharedWith as Types.ObjectId[]) ?? []).map((u) => u.toString());
      const accessible =
        shared.includes(memberUserId) || b.createdBy?.toString() === memberUserId;
      if (!accessible) continue;
      leadBatches.push({
        batchId: String(b._id),
        batchName: String(b.name),
        headers: (b.headers as string[]) ?? [],
        rows: (b.rows as string[][]) ?? [],
        assignedViaShare: shared.includes(memberUserId),
      });
    }

    const since = new Date();
    since.setDate(since.getDate() - 14);

    const logs = await this.queryBatchLogs(h.root.id, allBatchIds, memberUserId, 500);
    const recentLogs = logs.filter((row) => {
      const r = row as Record<string, unknown>;
      const at = (row.occurredAt as Date) ?? (r.createdAt as Date | undefined);
      return at && new Date(at) >= since;
    });

    const logRows: ActivityLogRow[] = recentLogs.map((row) => ({
      _id: row._id,
      action: String(row.action),
      metadata: row.metadata,
      resourceId: row.resourceId,
      occurredAt: row.occurredAt,
      createdAt: (row as Record<string, unknown>).createdAt,
    })) as ActivityLogRow[];

    const { summaryByUser } = await this.loadActivityMaps(h.root.id, allBatchIds);
    const activity = summaryByUser.get(memberUserId) ?? emptySummary();

    return buildMemberPerformance(userRef, logRows, leadBatches, activity, 14);
  }

  async getMemberActions(
    batchId: string,
    memberUserId: string,
    actorId: string,
    roles: string[] = [],
    limit = 80,
  ): Promise<HierarchyActionItem[]> {
    const h = await this.getHierarchy(batchId, actorId, roles);
    const treeDocs = await collectBatchTree(this.batchModel, h.root.id);
    const allBatchIds = treeDocs.map((d) => String(d._id));
    const logs = await this.queryBatchLogs(h.root.id, allBatchIds, memberUserId, limit);
    return logs.map((row) => this.formatAction(row));
  }

  private async loadShareEvents(
    rootId: string,
    batchIds: string[],
    userMap: Map<
      string,
      {
        id: string;
        name: string;
        email: string;
        role: HierarchyUserRef['role'];
      }
    >,
  ): Promise<HierarchyShareEvent[]> {
    const logs = await this.logModel
      .find({
        action: 'BATCH_SHARE',
        $or: [
          { 'metadata.rootBatchId': rootId },
          { 'metadata.batchId': { $in: batchIds } },
          { resourceId: { $in: batchIds } },
        ],
      })
      .sort({ occurredAt: -1 })
      .limit(200)
      .lean()
      .exec();

    return logs.map((row) => {
      const meta = (row.metadata as Record<string, unknown>) ?? {};
      const sharerId = row.userId?.toString() ?? '';
      const sharer = userMap.get(sharerId);
      const r = row as Record<string, unknown>;
      const at = (row.occurredAt as Date) ?? (r.createdAt as Date | undefined);
      const rawRecipients = (meta.sharedUsers as Array<Record<string, unknown>>) ?? [];
      const recipients: HierarchyShareRecipient[] = rawRecipients.length
        ? rawRecipients.map((u) => ({
            id: String(u.id ?? ''),
            name: String(u.name ?? u.email ?? 'User'),
            email: String(u.email ?? ''),
            role: primaryRole([String(u.role ?? 'employee')]),
          }))
        : ((meta.sharedUserIds as string[]) ?? []).map((id) => {
            const u = userMap.get(id);
            return {
              id,
              name: u?.name ?? id,
              email: u?.email ?? '',
              role: u?.role ?? 'employee',
            };
          });

      return {
        id: String(row._id),
        sharerId,
        sharerName: sharer?.name ?? String(row.userName ?? 'Unknown'),
        sharerRole: sharer?.role ?? 'employee',
        batchId: String(meta.batchId ?? row.resourceId ?? ''),
        batchName: String(meta.batchName ?? 'Campaign'),
        rowCount: Number(meta.rowCount ?? 0),
        recipients,
        occurredAt: at ? new Date(at).toISOString() : '',
      };
    });
  }

  private toUserRef(
    u?: {
      id: string;
      name: string;
      email: string;
      employeeId?: string;
      role: HierarchyUserRef['role'];
    },
  ): HierarchyUserRef {
    return {
      id: u?.id ?? '',
      name: u?.name ?? 'Unknown',
      email: u?.email ?? '',
      employeeId: u?.employeeId,
      role: u?.role ?? 'employee',
    };
  }

  private async loadActivityMaps(rootId: string, batchIds: string[]) {
    const validIds = batchIds.filter((id) => Types.ObjectId.isValid(id));
    const summaryByUser = new Map<string, ActivitySummary>();

    if (!validIds.length) return { summaryByUser };

    const orClauses: Record<string, unknown>[] = [
      { 'metadata.batchId': { $in: validIds } },
      { 'metadata.rootBatchId': rootId },
      { resourceId: { $in: validIds } },
    ];
    for (const id of validIds) {
      orClauses.push({ resourceId: { $regex: new RegExp(`^${escapeRegex(id)}:`) } });
    }

    const logs = await this.logModel
      .find({
        $or: orClauses,
        action: { $in: BATCH_ACTIONS },
      })
      .sort({ occurredAt: -1 })
      .limit(3000)
      .lean()
      .exec();

    for (const row of logs) {
      const uid = row.userId?.toString();
      if (!uid) continue;
      const summary = summaryByUser.get(uid) ?? emptySummary();
      const action = String(row.action);
      if (action === 'LEAD_VIEW') summary.views += 1;
      else if (action === 'LEAD_TOUCH') summary.touches += 1;
      else if (action === 'LEAD_UPDATE') summary.updates += 1;
      else if (action === 'BATCH_CREATE') summary.batchCreates += 1;
      else if (action === 'BATCH_SHARE') summary.shares += 1;

      const r = row as Record<string, unknown>;
      const at = (row.occurredAt as Date) ?? (r.createdAt as Date | undefined);
      if (at) {
        const iso = at.toISOString();
        if (!summary.lastActivityAt || iso > summary.lastActivityAt) {
          summary.lastActivityAt = iso;
        }
      }
      summaryByUser.set(uid, summary);
    }

    return { summaryByUser };
  }

  private async queryBatchLogs(
    rootId: string,
    batchIds: string[],
    userId: string,
    limit: number,
  ) {
    const validIds = batchIds.filter((id) => Types.ObjectId.isValid(id));
    const orClauses: Record<string, unknown>[] = [
      { 'metadata.batchId': { $in: validIds } },
      { 'metadata.rootBatchId': rootId },
      { resourceId: { $in: validIds } },
    ];
    for (const id of validIds) {
      orClauses.push({ resourceId: { $regex: new RegExp(`^${escapeRegex(id)}:`) } });
    }
    return this.logModel
      .find({
        userId: new Types.ObjectId(userId),
        $or: orClauses,
        action: { $in: BATCH_ACTIONS },
      })
      .sort({ occurredAt: -1 })
      .limit(limit)
      .lean()
      .exec();
  }

  private formatAction(row: Record<string, unknown>): HierarchyActionItem {
    const meta = (row.metadata as Record<string, unknown>) ?? {};
    const at = (row.occurredAt as Date) ?? (row.createdAt as Date);
    const action = String(row.action ?? '');
    return {
      id: String(row._id),
      action,
      label: actionLabel(action),
      occurredAt: at ? new Date(at).toISOString() : '',
      batchId: meta.batchId as string | undefined,
      batchName: meta.batchName as string | undefined,
      leadLabel: meta.leadLabel as string | undefined,
      metadata: meta,
    };
  }
}

function emptySummary(): ActivitySummary {
  return {
    views: 0,
    touches: 0,
    updates: 0,
    batchCreates: 0,
    shares: 0,
  };
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    LEAD_VIEW: 'Opened campaign',
    LEAD_TOUCH: 'Touched lead',
    LEAD_UPDATE: 'Updated lead',
    BATCH_CREATE: 'Created campaign',
    BATCH_SHARE: 'Shared campaign',
  };
  return map[action] ?? action.replace(/_/g, ' ').toLowerCase();
}
