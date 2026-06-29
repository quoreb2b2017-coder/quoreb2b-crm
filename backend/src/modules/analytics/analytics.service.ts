import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User } from '../users/schemas/user.schema';
import { MasterDataRecord, MASTER_DATA_KEY } from '../master-data/schemas/master-data.schema';
import { Batch } from '../batches/schemas/batch.schema';
import { ActivityLog } from '../activity-logs/schemas/activity-log.schema';
import { ElasticsearchService } from '../../elasticsearch/elasticsearch.service';
import { HealthService } from '../../health/health.service';
import { BatchesService } from '../batches/batches.service';
import { AppCacheService } from '../../redis/app-cache.service';
import { cacheTtlSeconds, stableHash } from '../../redis/cache.util';
import { ConfigService } from '@nestjs/config';
import {
  buildLeadActivityReport,
  type BatchLeadSnapshot,
} from '../activity-logs/lead-activity-report.util';
import {
  dayBounds,
  monthBounds,
  type ActivityLogRow,
} from '../activity-logs/employee-report.util';
import { aggregateBatchesLeadStats } from '../activity-logs/sheet-lead-stats.util';
import { DASHBOARD_EXCLUDED_ACTIVITY_ACTIONS } from '../activity-logs/activity-actions.constant';

const LEAD_ACTIONS = new Set(['LEAD_UPDATE', 'LEAD_TOUCH', 'LEAD_VIEW']);

function countUniqueLeadsFromLogs(logs: ActivityLogRow[]): number {
  const keys = new Set<string>();
  for (const log of logs) {
    if (!LEAD_ACTIONS.has(log.action)) continue;
    const meta = (log.metadata as Record<string, unknown>) ?? {};
    const batchId = String(meta.batchId ?? log.resourceId?.split(':')[0] ?? '');
    const leadKey = String(meta.leadKey ?? '');
    if (batchId && leadKey) keys.add(`${batchId}::${leadKey}`);
  }
  return keys.size;
}

function mergeStatusBreakdown(
  batches: Array<{ headers: string[]; rows: string[][] }>,
): Array<{ label: string; count: number; pct: number }> {
  const merged = new Map<string, number>();
  for (const b of batches) {
    const { statusBreakdown } = countFromSheet(b.headers, b.rows);
    for (const [label, count] of statusBreakdown) {
      merged.set(label, (merged.get(label) ?? 0) + count);
    }
  }
  const total = [...merged.values()].reduce((s, n) => s + n, 0) || 1;
  return [...merged.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([label, count]) => ({
      label,
      count,
      pct: Math.round((count / total) * 100),
    }));
}

/* ── shared helper ─────────────────────────────────────────────── */
interface SheetCounts {
  total: number;
  active: number;
  leads: number;
  statusBreakdown: Map<string, number>;
}

function countFromSheet(headers: string[], rows: string[][]): SheetCounts {
  const statusIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'status');
  const dispositionIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'disposition');

  let active = 0;
  let leads = 0;
  const statusMap = new Map<string, number>();

  // Decide which column to use
  const colIdx = statusIdx !== -1 ? statusIdx : dispositionIdx;

  if (colIdx !== -1) {
    for (const row of rows) {
      const raw = row[colIdx]?.trim() ?? '';
      if (!raw || raw === '-') continue;
      const lower = raw.toLowerCase();
      if (lower === 'active') active++;
      if (lower === 'lead' || lower === 'leads') leads++;
      statusMap.set(raw, (statusMap.get(raw) ?? 0) + 1);
    }
  }

  return { total: rows.length, active, leads, statusBreakdown: statusMap };
}

/* ── service ───────────────────────────────────────────────────── */
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(MasterDataRecord.name) private masterDataModel: Model<MasterDataRecord>,
    @InjectModel(Batch.name) private batchModel: Model<Batch>,
    @InjectModel(ActivityLog.name) private activityLogModel: Model<ActivityLog>,
    private elasticsearch: ElasticsearchService,
    private healthService: HealthService,
    private batchesService: BatchesService,
    private cache: AppCacheService,
    private config: ConfigService,
  ) {}

  /** Live CRM data for DB Administrator home */
  async getDbAdminDashboard(actorId: string) {
    return this.cache.wrap(
      `dashboard:db-admin:${actorId}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.buildDbAdminDashboard(actorId),
    );
  }

  private async buildDbAdminDashboard(actorId: string) {
    if (!Types.ObjectId.isValid(actorId)) {
      return await this.emptyDbAdminDashboard();
    }
    const oid = new Types.ObjectId(actorId);

    const [batches, masterDoc, recentLogs, health] = await Promise.all([
      this.batchModel
        .find({ $or: [{ createdBy: oid }, { sharedWith: oid }] })
        .select('name rowCount columnCount createdAt updatedAt createdBy sharedWith batchMonth batchYear status')
        .sort({ updatedAt: -1 })
        .lean()
        .exec(),
      this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).select('headers rows sharedWithDbAdmins updatedAt').lean().exec(),
      this.activityLogModel
        .find({
          userId: oid,
          action: { $nin: [...DASHBOARD_EXCLUDED_ACTIVITY_ACTIONS] },
        })
        .sort({ occurredAt: -1 })
        .limit(10)
        .lean()
        .exec(),
      this.healthService.getStatus(),
    ]);

    const dbCheck = health.checks.database;
    const mongoLabel =
      dbCheck.status === 'up'
        ? 'Connected'
        : dbCheck.status === 'connecting'
          ? 'Connecting'
          : 'Down';

    const owned = batches.filter((b) => b.createdBy?.toString() === actorId);
    const sharedWithMe = batches.filter((b) => b.createdBy?.toString() !== actorId);

    let totalRowsInBatches = 0;
    let employeesWithAccess = 0;
    let activeLeads = 0;
    let wonLeads = 0;

    for (const b of batches) {
      totalRowsInBatches += (b.rowCount as number) ?? 0;
      if (b.createdBy?.toString() === actorId) {
        employeesWithAccess += ((b.sharedWith as Types.ObjectId[]) ?? []).length;
      }
    }

    if (masterDoc?.rows?.length && (masterDoc.headers as string[])?.length) {
      const masterCounts = countFromSheet(
        masterDoc.headers as string[],
        masterDoc.rows as string[][],
      );
      activeLeads = masterCounts.active;
      wonLeads = masterCounts.leads;
    }

    const hasMasterAccess = !!masterDoc?.rows?.length;

    let masterData: {
      totalRows: number;
      batchedRows: number;
      availableRows: number;
      batchesFromMaster: number;
    } | null = null;

    if (hasMasterAccess && masterDoc?.rows?.length) {
      const masterUpdatedAt = (masterDoc as { updatedAt?: Date }).updatedAt?.getTime?.() ?? 0;
      const coverage = await this.batchesService.getMasterBatchCoverage(
        masterDoc.headers as string[],
        masterDoc.rows as string[][],
        masterUpdatedAt,
      );
      masterData = {
        totalRows: masterDoc.rows.length,
        batchedRows: coverage.summary.batchedRows,
        availableRows: coverage.summary.availableRows,
        batchesFromMaster: coverage.summary.batchesFromMaster,
      };
    }

    return {
      health: {
        status: health.status,
        mongo: mongoLabel,
        mongoState: dbCheck.state,
        redis: health.checks.redis.status,
        elasticsearch:
          health.checks.elasticsearch.status === 'disabled'
            ? 'disabled'
            : health.checks.elasticsearch.status,
      },
      batches: {
        total: batches.length,
        owned: owned.length,
        sharedWithMe: sharedWithMe.length,
        totalRows: totalRowsInBatches,
        activeLeads,
        wonLeads,
        employeesShared: employeesWithAccess,
      },
      masterData,
      recentBatches: batches.slice(0, 8).map((b) => ({
        id: String(b._id),
        name: b.name as string,
        rowCount: (b.rowCount as number) ?? 0,
        isOwner: b.createdBy?.toString() === actorId,
        sharedCount: ((b.sharedWith as Types.ObjectId[]) ?? []).length,
        batchMonth: b.batchMonth as number | undefined,
        batchYear: b.batchYear as number | undefined,
        updatedAt:
          ((b as Record<string, unknown>).updatedAt as Date)?.toISOString?.() ??
          ((b as Record<string, unknown>).createdAt as Date)?.toISOString?.() ??
          '',
      })),
      recentActivity: recentLogs.map((log) => {
        const meta = (log.metadata as Record<string, unknown>) ?? {};
        return {
          id: String(log._id),
          action: log.action as string,
          resource: log.resource as string,
          path: log.path as string | undefined,
          batchName: meta.batchName as string | undefined,
          occurredAt: (log.occurredAt as Date)?.toISOString?.() ?? '',
        };
      }),
    };
  }

  /** Live CRM data for Employee home (assigned batches + their activity) */
  async getEmployeeDashboard(actorId: string) {
    const now = new Date();
    const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return this.cache.wrap(
      `dashboard:employee:${actorId}:${dayKey}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.buildEmployeeDashboard(actorId),
    );
  }

  private async buildEmployeeDashboard(actorId: string) {
    if (!Types.ObjectId.isValid(actorId)) {
      return this.emptyEmployeeDashboard();
    }
    const oid = new Types.ObjectId(actorId);
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const { start: monthStart, end: monthEnd, label: monthLabel } = monthBounds(year, month);
    const { start: todayStart, end: todayEnd, label: todayLabel } = dayBounds(dateStr);

    const [user, batches, monthLogs, todayLogs, recentLogs] = await Promise.all([
      this.userModel.findById(oid).select('firstName lastName email employeeId').lean().exec(),
      this.batchModel
        .find({ sharedWith: oid })
        .select('name rowCount headers rows batchMonth batchYear updatedAt createdAt')
        .sort({ updatedAt: -1 })
        .lean()
        .exec(),
      this.activityLogModel
        .find({ userId: oid, occurredAt: { $gte: monthStart, $lte: monthEnd } })
        .sort({ occurredAt: -1 })
        .limit(2500)
        .lean()
        .exec(),
      this.activityLogModel
        .find({ userId: oid, occurredAt: { $gte: todayStart, $lte: todayEnd } })
        .lean()
        .exec(),
      this.activityLogModel
        .find({
          userId: oid,
          action: { $nin: [...DASHBOARD_EXCLUDED_ACTIVITY_ACTIONS] },
        })
        .sort({ occurredAt: -1 })
        .limit(10)
        .lean()
        .exec(),
    ]);

    const leadBatches: BatchLeadSnapshot[] = batches
      .filter((b) => ((b.rows as string[][]) ?? []).length > 0)
      .map((b) => ({
        batchId: String(b._id),
        batchName: String(b.name ?? 'Batch'),
        headers: (b.headers as string[]) ?? [],
        rows: (b.rows as string[][]) ?? [],
        assignedViaShare: true,
      }));

    const sheetStats = aggregateBatchesLeadStats(
      leadBatches.map((b) => ({ headers: b.headers, rows: b.rows })),
    );

    const leadActivity = buildLeadActivityReport(
      monthLogs as ActivityLogRow[],
      leadBatches,
    );
    const s = leadActivity.summary;

    const todayLeadActions = todayLogs.filter((l) => LEAD_ACTIONS.has(l.action as string)).length;
    const todayLeadsWorked = countUniqueLeadsFromLogs(todayLogs as ActivityLogRow[]);

    const monthLeadActions = monthLogs.filter((l) => LEAD_ACTIONS.has(l.action as string)).length;

    let totalRows = 0;
    for (const b of batches) {
      totalRows += (b.rowCount as number) ?? (b.rows as string[][])?.length ?? 0;
    }

    return {
      user: {
        name: user
          ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || 'Employee'
          : 'Employee',
        email: user?.email as string | undefined,
        employeeId: user?.employeeId as string | undefined,
      },
      period: { monthLabel, todayLabel, year, month },
      batches: {
        total: batches.length,
        totalRows,
        totalLeads: sheetStats.totalLeads,
        activeLeads: sheetStats.activeLeads,
        wonLeads: sheetStats.wonLeads,
      },
      workThisMonth: {
        touched: s.touched,
        updated: s.updated,
        touchedOnly: s.touchedOnly,
        notTouched: s.notTouched,
        periodWorkedLeads: s.periodWorkedLeads,
        leadActions: monthLeadActions,
      },
      today: {
        actions: todayLogs.length,
        leadActions: todayLeadActions,
        leadsWorked: todayLeadsWorked,
      },
      statusBreakdown: mergeStatusBreakdown(
        leadBatches.map((b) => ({ headers: b.headers, rows: b.rows })),
      ),
      recentBatches: batches.slice(0, 8).map((b) => ({
        id: String(b._id),
        name: b.name as string,
        rowCount: (b.rowCount as number) ?? (b.rows as string[][])?.length ?? 0,
        batchMonth: b.batchMonth as number | undefined,
        batchYear: b.batchYear as number | undefined,
        updatedAt:
          ((b as Record<string, unknown>).updatedAt as Date)?.toISOString?.() ??
          ((b as Record<string, unknown>).createdAt as Date)?.toISOString?.() ??
          '',
      })),
      recentActivity: recentLogs.map((log) => {
        const meta = (log.metadata as Record<string, unknown>) ?? {};
        return {
          id: String(log._id),
          action: log.action as string,
          resource: log.resource as string,
          path: log.path as string | undefined,
          batchName: meta.batchName as string | undefined,
          occurredAt: (log.occurredAt as Date)?.toISOString?.() ?? '',
        };
      }),
    };
  }

  private emptyEmployeeDashboard() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const { label: monthLabel } = monthBounds(year, month);
    const { label: todayLabel } = dayBounds(dateStr);
    return {
      user: { name: 'Employee', email: undefined, employeeId: undefined },
      period: { monthLabel, todayLabel, year, month },
      batches: {
        total: 0,
        totalRows: 0,
        totalLeads: 0,
        activeLeads: 0,
        wonLeads: 0,
      },
      workThisMonth: {
        touched: 0,
        updated: 0,
        touchedOnly: 0,
        notTouched: 0,
        periodWorkedLeads: 0,
        leadActions: 0,
      },
      today: { actions: 0, leadActions: 0, leadsWorked: 0 },
      statusBreakdown: [],
      recentBatches: [],
      recentActivity: [],
    };
  }

  private async emptyDbAdminDashboard() {
    const health = await this.healthService.getStatus();
    return {
      health: {
        status: health.status,
        mongo: 'Unknown',
        mongoState: health.checks.database.state,
        redis: health.checks.redis.status,
        elasticsearch:
          health.checks.elasticsearch.status === 'disabled'
            ? 'disabled'
            : health.checks.elasticsearch.status,
      },
      batches: {
        total: 0,
        owned: 0,
        sharedWithMe: 0,
        totalRows: 0,
        activeLeads: 0,
        wonLeads: 0,
        employeesShared: 0,
      },
      masterData: null,
      recentBatches: [],
      recentActivity: [],
    };
  }

  async getDashboardStats() {
    return this.cache.wrap(
      'analytics:stats:global',
      cacheTtlSeconds(this.config, 'long'),
      () => this.loadDashboardStats(),
    );
  }

  /** Super Admin dashboard — meaningful work actions only (no login/logout noise) */
  async getRecentWorkActivity(limit = 12) {
    const capped = Math.min(Math.max(limit, 1), 50);
    return this.cache.wrap(
      `analytics:recent-work:${capped}`,
      cacheTtlSeconds(this.config, 'short'),
      () => this.loadRecentWorkActivity(capped),
    );
  }

  private async loadRecentWorkActivity(limit: number) {
    const logs = await this.activityLogModel
      .find({ action: { $nin: [...DASHBOARD_EXCLUDED_ACTIVITY_ACTIONS] } })
      .sort({ occurredAt: -1 })
      .limit(limit)
      .lean()
      .exec();

    return logs.map((log) => {
      const meta = (log.metadata as Record<string, unknown>) ?? {};
      return {
        id: String(log._id),
        action: log.action as string,
        resource: log.resource as string,
        path: log.path as string | undefined,
        batchName: meta.batchName as string | undefined,
        userName: (log.userName as string) ?? 'Unknown',
        userRole: log.userRole as string | undefined,
        employeeId: log.employeeId as string | undefined,
        occurredAt: (log.occurredAt as Date)?.toISOString?.() ?? '',
      };
    });
  }

  private async loadDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, newUsersThisMonth, masterData, batches] = await Promise.all([
      this.userModel.countDocuments({ isActive: true }),
      this.userModel.countDocuments({ createdAt: { $gte: startOfMonth } }),
      this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).select('headers rows').lean().exec(),
      this.batchModel.find().select('rowCount').lean().exec(),
    ]);

    let totalLeads = 0;
    let activeLeads = 0;
    let statusLeads = 0;

    if (masterData?.rows?.length) {
      const c = countFromSheet(
        (masterData as { headers?: string[] }).headers ?? [],
        masterData.rows as string[][],
      );
      totalLeads = c.total;
      activeLeads = c.active;
      statusLeads = c.leads;
    }

    const batchCount = batches.length;
    const activeRate =
      totalLeads > 0 ? Math.round((activeLeads / totalLeads) * 1000) / 10 : 0;
    const wonRate =
      totalLeads > 0 ? Math.round((statusLeads / totalLeads) * 1000) / 10 : 0;

    return {
      totalUsers,
      newUsersThisMonth,
      totalLeads,
      activeLeads,
      statusLeads,
      batchCount,
      activeRate,
      wonRate,
    };
  }

  async getChartData() {
    return this.cache.wrap(
      'analytics:chart:status-breakdown',
      cacheTtlSeconds(this.config, 'long'),
      () => this.loadChartData(),
    );
  }

  private async loadChartData() {
    const [masterData, batchCount] = await Promise.all([
      this.masterDataModel.findOne({ key: MASTER_DATA_KEY }).select('headers rows').lean().exec(),
      this.batchModel.countDocuments().exec(),
    ]);

    const combinedMap = new Map<string, number>();
    let totalLeads = 0;

    if (masterData?.rows?.length) {
      const c = countFromSheet(
        (masterData as { headers?: string[] }).headers ?? [],
        masterData.rows as string[][],
      );
      totalLeads = c.total;
      c.statusBreakdown.forEach((v, k) => combinedMap.set(k, (combinedMap.get(k) ?? 0) + v));
    }

    if (combinedMap.size === 0) {
      return { statusBreakdown: [], totalLeads };
    }

    const breakdownTotal = Array.from(combinedMap.values()).reduce((s, v) => s + v, 0);

    const statusBreakdown = Array.from(combinedMap.entries())
      .map(([label, count]) => ({
        label,
        count,
        pct: breakdownTotal > 0 ? Math.round((count / breakdownTotal) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);

    const topStatus = statusBreakdown[0]?.label ?? null;
    const topStatusPct = statusBreakdown[0]?.pct ?? 0;

    return {
      statusBreakdown,
      totalLeads,
      trackedRows: breakdownTotal,
      uniqueStatuses: statusBreakdown.length,
      batchCount,
      topStatus,
      topStatusPct,
    };
  }

  async searchLeads(query: string) {
    if (!query?.trim()) return [];

    if (this.elasticsearch.isEnabled) {
      const hits = await this.elasticsearch.search<{ firstName?: string; lastName?: string; email?: string }>(
        'leads',
        {
          query: { multi_match: { query, fields: ['firstName', 'lastName', 'email'] } },
        },
      );
      if (hits.length) return hits;
    }

    return [];
  }
}
