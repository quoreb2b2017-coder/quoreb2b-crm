import { fingerprintLeadRow } from './lead-identify.util';
import { resolveActivityTimestamp } from './activity-date.util';
import type { ActivityLogRow } from './employee-report.util';
import {
  aggregateBatchesLeadStats,
  classifyRowStatus,
  countSheetLeadStats,
  type SheetLeadStats,
} from './sheet-lead-stats.util';

export type { SheetLeadStats };

const LEAD_ACTIONS = new Set(['LEAD_UPDATE', 'LEAD_TOUCH', 'LEAD_VIEW']);

export interface BatchLeadSnapshot {
  batchId: string;
  batchName: string;
  headers: string[];
  rows: string[][];
  /** True when batch was shared with this employee (assigned work) */
  assignedViaShare: boolean;
}

export interface LeadActivityItem {
  leadKey: string;
  leadLabel: string;
  batchId: string;
  batchName: string;
  rowIndex: number;
  status: 'updated' | 'touched' | 'viewed';
  changedColumns?: string[];
  lastAt: string;
  action: string;
}

export interface LeadActivityReport {
  summary: {
    totalAssigned: number;
    touched: number;
    updated: number;
    /** Leads with touch but no field update */
    touchedOnly: number;
    viewedOnly: number;
    notTouched: number;
    batchCount: number;
    /** Assigned to this employee only (their batches) */
    totalLeads: number;
    activeLeads: number;
    wonLeads: number;
    /** Leads they worked on in this report period */
    periodWorkedLeads: number;
    periodActiveLeads: number;
    periodWonLeads: number;
  };
  byBatch: Array<{
    batchId: string;
    batchName: string;
    totalLeads: number;
    activeLeads: number;
    wonLeads: number;
    touched: number;
    updated: number;
    notTouched: number;
  }>;
  touchedLeads: LeadActivityItem[];
  notTouchedLeads: Array<{
    leadKey: string;
    leadLabel: string;
    batchId: string;
    batchName: string;
    rowIndex: number;
  }>;
}

function logTime(log: ActivityLogRow): Date {
  return (
    resolveActivityTimestamp(log as unknown as Record<string, unknown>) ??
    new Date(0)
  );
}

function compositeKey(batchId: string, leadKey: string): string {
  return `${batchId}::${leadKey}`;
}

function countPeriodLeadStats(
  batches: BatchLeadSnapshot[],
  touchMap: Map<string, LeadActivityItem & { priority: number }>,
): Pick<
  LeadActivityReport['summary'],
  'periodWorkedLeads' | 'periodActiveLeads' | 'periodWonLeads'
> {
  let periodWorkedLeads = 0;
  let periodActiveLeads = 0;
  let periodWonLeads = 0;
  const batchById = new Map(batches.map((b) => [b.batchId, b]));

  for (const item of touchMap.values()) {
    const batch = batchById.get(item.batchId);
    if (!batch) continue;
    const row = batch.rows[item.rowIndex];
    if (!row?.some((c) => (c ?? '').trim().length > 0)) continue;
    periodWorkedLeads++;
    const status = classifyRowStatus(batch.headers, row);
    if (status === 'active') periodActiveLeads++;
    else if (status === 'won') periodWonLeads++;
  }

  return { periodWorkedLeads, periodActiveLeads, periodWonLeads };
}

export function buildLeadActivityReport(
  logs: ActivityLogRow[],
  batches: BatchLeadSnapshot[],
): LeadActivityReport {
  const leadLogs = logs.filter((l) => LEAD_ACTIONS.has(l.action));

  const touchMap = new Map<
    string,
    LeadActivityItem & { priority: number }
  >();

  for (const log of leadLogs) {
    const meta = (log.metadata as Record<string, unknown>) ?? {};
    const batchId = String(meta.batchId ?? log.resourceId?.split(':')[0] ?? '');
    const leadKey = String(meta.leadKey ?? '');
    if (!batchId || !leadKey) continue;

    const batchName = String(meta.batchName ?? 'Batch');
    const rowIndex = Number(meta.rowIndex ?? 0);
    const leadLabel = String(meta.leadLabel ?? leadKey);
    const changedColumns = Array.isArray(meta.changedColumns)
      ? (meta.changedColumns as string[])
      : undefined;

    let status: LeadActivityItem['status'] = 'viewed';
    let priority = 1;
    if (log.action === 'LEAD_UPDATE') {
      status = 'updated';
      priority = 3;
    } else if (log.action === 'LEAD_TOUCH') {
      status = 'touched';
      priority = 2;
    }

    const key = compositeKey(batchId, leadKey);
    const at = logTime(log).toISOString();
    const existing = touchMap.get(key);
    if (!existing) {
      touchMap.set(key, {
        leadKey,
        leadLabel,
        batchId,
        batchName,
        rowIndex,
        status,
        changedColumns,
        lastAt: at,
        action: log.action,
        priority,
      });
      continue;
    }
    const mergedPriority = Math.max(existing.priority, priority);
    const mergedStatus: LeadActivityItem['status'] =
      mergedPriority === 3 ? 'updated' : mergedPriority === 2 ? 'touched' : 'viewed';
    touchMap.set(key, {
      leadKey,
      leadLabel,
      batchId,
      batchName,
      rowIndex,
      status: mergedStatus,
      changedColumns: changedColumns ?? existing.changedColumns,
      lastAt: at > existing.lastAt ? at : existing.lastAt,
      action: log.action,
      priority: mergedPriority,
    });
  }

  const assignedKeys = new Set<string>();
  const byBatchMap = new Map<
    string,
    { batchId: string; batchName: string; leads: Array<{ leadKey: string; leadLabel: string; rowIndex: number }> }
  >();

  for (const batch of batches) {
    const leads: Array<{ leadKey: string; leadLabel: string; rowIndex: number }> = [];
    batch.rows.forEach((row, rowIndex) => {
      const hasData = row.some((c) => (c ?? '').trim().length > 0);
      if (!hasData) return;
      const fp = fingerprintLeadRow(batch.headers, row, rowIndex);
      leads.push({ leadKey: fp.leadKey, leadLabel: fp.leadLabel, rowIndex });
      assignedKeys.add(compositeKey(batch.batchId, fp.leadKey));
    });
    byBatchMap.set(batch.batchId, {
      batchId: batch.batchId,
      batchName: batch.batchName,
      leads,
    });
  }

  const touchedLeads: LeadActivityItem[] = [];
  let updated = 0;
  let touchedOnly = 0;
  let viewedOnly = 0;

  for (const [, item] of touchMap) {
    if (!assignedKeys.has(compositeKey(item.batchId, item.leadKey))) continue;
    const { priority: _p, ...rest } = item;
    touchedLeads.push(rest);
    if (rest.status === 'updated') updated++;
    else if (rest.status === 'touched') touchedOnly++;
    else if (rest.status === 'viewed') viewedOnly++;
  }

  touchedLeads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  const touchedKeySet = new Set(
    touchedLeads.map((t) => compositeKey(t.batchId, t.leadKey)),
  );

  const notTouchedLeads: LeadActivityReport['notTouchedLeads'] = [];
  for (const batch of batches) {
    const entry = byBatchMap.get(batch.batchId);
    if (!entry) continue;
    for (const lead of entry.leads) {
      const k = compositeKey(batch.batchId, lead.leadKey);
      if (!touchedKeySet.has(k)) {
        notTouchedLeads.push({
          leadKey: lead.leadKey,
          leadLabel: lead.leadLabel,
          batchId: batch.batchId,
          batchName: batch.batchName,
          rowIndex: lead.rowIndex,
        });
      }
    }
  }

  const byBatch: LeadActivityReport['byBatch'] = [];
  for (const batch of batches) {
    const entry = byBatchMap.get(batch.batchId);
    if (!entry) continue;
    let batchTouched = 0;
    let batchUpdated = 0;
    for (const lead of entry.leads) {
      const k = compositeKey(batch.batchId, lead.leadKey);
      if (touchedKeySet.has(k)) {
        batchTouched++;
        const t = touchedLeads.find((x) => compositeKey(x.batchId, x.leadKey) === k);
        if (t?.status === 'updated') batchUpdated++;
      }
    }
    const batchStats = countSheetLeadStats(batch.headers, batch.rows);
    byBatch.push({
      batchId: batch.batchId,
      batchName: batch.batchName,
      totalLeads: batchStats.totalLeads,
      activeLeads: batchStats.activeLeads,
      wonLeads: batchStats.wonLeads,
      touched: batchTouched,
      updated: batchUpdated,
      notTouched: entry.leads.length - batchTouched,
    });
  }

  const totalAssigned = assignedKeys.size;
  const touched = touchedLeads.length;
  const statusTotals = aggregateBatchesLeadStats(batches);
  const periodStats = countPeriodLeadStats(batches, touchMap);

  return {
    summary: {
      totalAssigned,
      touched,
      updated,
      touchedOnly,
      viewedOnly,
      notTouched: notTouchedLeads.length,
      batchCount: batches.length,
      totalLeads: statusTotals.totalLeads,
      activeLeads: statusTotals.activeLeads,
      wonLeads: statusTotals.wonLeads,
      ...periodStats,
    },
    byBatch: byBatch.sort((a, b) => b.notTouched - a.notTouched),
    touchedLeads: touchedLeads.slice(0, 500),
    notTouchedLeads: notTouchedLeads.slice(0, 500),
  };
}
