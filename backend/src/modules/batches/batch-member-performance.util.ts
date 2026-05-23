import type { ActivitySummary } from './batch-hierarchy.util';
import { buildLeadActivityReport, type LeadActivityReport } from '../activity-logs/lead-activity-report.util';
import type { ActivityLogRow } from '../activity-logs/employee-report.util';
import type { BatchLeadSnapshot } from '../activity-logs/lead-activity-report.util';
import { resolveActivityTimestamp } from '../activity-logs/activity-date.util';

export interface DailyActivityPoint {
  date: string;
  views: number;
  touches: number;
  updates: number;
  total: number;
}

export interface MemberPerformanceResult {
  user: { id: string; name: string; email: string; role: string };
  periodDays: number;
  activity: ActivitySummary;
  productivityScore: number;
  productivityLabel: string;
  leadActivity: LeadActivityReport;
  dailyActivity: DailyActivityPoint[];
  actionTotals: {
    views: number;
    /** Unique assigned leads with touch-level work (touched + updated) */
    touches: number;
    /** Raw LEAD_TOUCH log count */
    touchEvents: number;
    updates: number;
  };
  recentLeads: Array<{
    leadLabel: string;
    batchName: string;
    status: string;
    lastAt: string;
  }>;
}

function logDate(log: ActivityLogRow): string {
  const t =
    resolveActivityTimestamp(log as unknown as Record<string, unknown>) ?? new Date(0);
  return t.toISOString().slice(0, 10);
}

export function buildMemberPerformance(
  user: { id: string; name: string; email: string; role: string },
  logs: ActivityLogRow[],
  leadBatches: BatchLeadSnapshot[],
  activitySummary: ActivitySummary,
  periodDays = 14,
): MemberPerformanceResult {
  const leadActivity = buildLeadActivityReport(logs, leadBatches);
  const { summary } = leadActivity;

  const dayMap = new Map<string, DailyActivityPoint>();
  const start = new Date();
  start.setDate(start.getDate() - (periodDays - 1));
  for (let i = 0; i < periodDays; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    dayMap.set(key, { date: key, views: 0, touches: 0, updates: 0, total: 0 });
  }

  for (const log of logs) {
    const key = logDate(log);
    if (!dayMap.has(key)) continue;
    const pt = dayMap.get(key)!;
    if (log.action === 'LEAD_VIEW') {
      pt.views += 1;
    } else if (log.action === 'LEAD_TOUCH') {
      pt.touches += 1;
    } else if (log.action === 'LEAD_UPDATE') {
      pt.updates += 1;
    }
    pt.total = pt.views + pt.touches + pt.updates;
  }

  const dailyActivity = [...dayMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  const assigned = Math.max(summary.totalLeads, 1);
  const rawScore = Math.round(
    ((summary.updated * 3 + summary.touchedOnly * 2 + summary.viewedOnly) / assigned) * 100,
  );
  const productivityScore = Math.min(100, Math.max(0, rawScore));
  let productivityLabel = 'Needs attention';
  if (productivityScore >= 75) productivityLabel = 'High';
  else if (productivityScore >= 45) productivityLabel = 'Moderate';

  const recentLeads = leadActivity.touchedLeads
    .slice(0, 25)
    .map((l) => ({
      leadLabel: l.leadLabel,
      batchName: l.batchName,
      status: l.status,
      lastAt: l.lastAt,
    }));

  return {
    user,
    periodDays,
    activity: activitySummary,
    productivityScore,
    productivityLabel,
    leadActivity,
    dailyActivity,
    actionTotals: {
      views: activitySummary.views,
      touches: summary.touchedOnly + summary.updated,
      touchEvents: activitySummary.touches,
      updates: activitySummary.updates,
    },
    recentLeads,
  };
}
