import { resolveActivityTimestamp } from './activity-date.util';
import { isPassiveActivityAction } from './activity-actions.constant';
import {
  buildLeadActivityReport,
  type BatchLeadSnapshot,
  type LeadActivityReport,
} from './lead-activity-report.util';

export type { LeadActivityReport };

export interface ActivityLogRow {
  _id?: unknown;
  action: string;
  sessionId?: string;
  createdAt?: Date | string;
  occurredAt?: Date | string;
  path?: string;
  resourceId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionRow {
  sessionId: string;
  loginAt: string;
  logoutAt?: string;
  logoutType?: 'LOGOUT' | 'IDLE_LOGOUT';
  durationMinutes: number;
  durationFormatted: string;
  logoutTime: string;
  stillActive?: boolean;
}

export interface ReportSummary {
  loginCount: number;
  logoutCount: number;
  manualLogoutCount: number;
  idleLogoutCount: number;
  avgSessionMinutes: number;
  avgSessionFormatted: string;
  avgLogoutTime: string;
  totalActiveMinutes: number;
  totalActiveFormatted: string;
  actionCount: number;
  longestSessionMinutes: number;
  longestSessionFormatted: string;
}

export interface EmployeeReport {
  employee: {
    id: string;
    name: string;
    email?: string;
    employeeId?: string;
  };
  period: { type: 'daily' | 'monthly'; label: string; start: string; end: string };
  summary: ReportSummary;
  sessions: SessionRow[];
  dailyBreakdown?: Array<{
    date: string;
    loginCount: number;
    logoutCount: number;
    totalActiveMinutes: number;
    totalActiveFormatted: string;
  }>;
  activities: Array<{
    id: string;
    action: string;
    path?: string;
    ipAddress?: string;
    createdAt: string;
  }>;
  leadActivity?: LeadActivityReport;
}

const LOGOUT_ACTIONS = new Set(['LOGOUT', 'IDLE_LOGOUT']);

function toDate(log: ActivityLogRow): Date {
  return (
    resolveActivityTimestamp(log as unknown as Record<string, unknown>) ??
    new Date(0)
  );
}

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return '0m';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function avgLogoutClock(logoutDates: Date[]): string {
  if (!logoutDates.length) return '—';
  const totalMins = logoutDates.reduce((s, d) => s + d.getHours() * 60 + d.getMinutes(), 0);
  const avg = Math.round(totalMins / logoutDates.length);
  const h = Math.floor(avg / 60) % 24;
  const m = avg % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
}

function closeOpenSession(
  open: { loginAt: Date; sessionId: string },
  endAt: Date,
  completed: SessionRow[],
  logoutType?: 'LOGOUT' | 'IDLE_LOGOUT',
) {
  const durationMinutes = Math.max(
    0,
    Math.round((endAt.getTime() - open.loginAt.getTime()) / 60000),
  );
  if (durationMinutes <= 0) return;
  completed.push({
    sessionId: open.sessionId,
    loginAt: open.loginAt.toISOString(),
    logoutAt: endAt.toISOString(),
    logoutType,
    durationMinutes,
    durationFormatted: formatDuration(durationMinutes),
    logoutTime: formatTime(endAt),
  });
}

function buildSessions(logs: ActivityLogRow[], periodEnd: Date): SessionRow[] {
  const sorted = [...logs].sort(
    (a, b) => toDate(a).getTime() - toDate(b).getTime(),
  );

  const openBySession = new Map<string, { loginAt: Date; sessionId: string }>();
  const completed: SessionRow[] = [];

  for (const log of sorted) {
    const sid = log.sessionId || `legacy-${String(log._id)}`;
    const at = toDate(log);

    if (log.action === 'LOGIN') {
      // Only one active session: close any other open sessions at this login time.
      for (const [otherSid, open] of [...openBySession.entries()]) {
        if (otherSid !== sid) {
          closeOpenSession(open, at, completed);
          openBySession.delete(otherSid);
        }
      }
      const existing = openBySession.get(sid);
      if (existing) {
        closeOpenSession(existing, at, completed);
      }
      openBySession.set(sid, { loginAt: at, sessionId: sid });
      continue;
    }

    if (LOGOUT_ACTIONS.has(log.action)) {
      const open = openBySession.get(sid);
      if (open) {
        closeOpenSession(open, at, completed, log.action as 'LOGOUT' | 'IDLE_LOGOUT');
        openBySession.delete(sid);
      }
    }
  }

  for (const [sid, open] of openBySession) {
    const durationMinutes = Math.max(
      0,
      Math.round((periodEnd.getTime() - open.loginAt.getTime()) / 60000),
    );
    completed.push({
      sessionId: sid,
      loginAt: open.loginAt.toISOString(),
      durationMinutes,
      durationFormatted: formatDuration(durationMinutes),
      logoutTime: '—',
      stillActive: true,
    });
  }

  return completed.sort(
    (a, b) => new Date(b.loginAt).getTime() - new Date(a.loginAt).getTime(),
  );
}

function buildSummary(logs: ActivityLogRow[], sessions: SessionRow[]): ReportSummary {
  const loginCount = logs.filter((l) => l.action === 'LOGIN').length;
  const manualLogoutCount = logs.filter((l) => l.action === 'LOGOUT').length;
  const idleLogoutCount = logs.filter((l) => l.action === 'IDLE_LOGOUT').length;
  const logoutCount = manualLogoutCount + idleLogoutCount;

  const durations = sessions.map((s) => s.durationMinutes);
  const totalActiveMinutes = durations.reduce((a, b) => a + b, 0);
  const avgSessionMinutes = durations.length
    ? Math.round(totalActiveMinutes / durations.length)
    : 0;
  const longestSessionMinutes = durations.length ? Math.max(...durations) : 0;

  const logoutDates = sessions
    .filter((s) => s.logoutAt)
    .map((s) => new Date(s.logoutAt!));

  return {
    loginCount,
    logoutCount,
    manualLogoutCount,
    idleLogoutCount,
    avgSessionMinutes,
    avgSessionFormatted: formatDuration(avgSessionMinutes),
    avgLogoutTime: avgLogoutClock(logoutDates),
    totalActiveMinutes,
    totalActiveFormatted: formatDuration(totalActiveMinutes),
    actionCount: logs.filter((l) => !isPassiveActivityAction(l.action)).length,
    longestSessionMinutes,
    longestSessionFormatted: formatDuration(longestSessionMinutes),
  };
}

export interface DailyWorkTimeRow {
  date: string;
  dayLabel: string;
  totalMinutes: number;
  totalFormatted: string;
  isToday: boolean;
}

export interface WorkTimeSnapshot {
  monthlyMinutes: number;
  monthlyFormatted: string;
  todayMinutes: number;
  todayFormatted: string;
  dailyBreakdown: DailyWorkTimeRow[];
  currentSession: {
    sessionId: string;
    loginAt: string;
    elapsedSeconds: number;
    elapsedFormatted: string;
    isActive: boolean;
  } | null;
}

function localDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Split session duration across calendar days (handles overnight shifts). */
function allocateSessionToDays(
  loginAt: Date,
  endAt: Date,
  dayTotals: Map<string, number>,
): void {
  let cursor = new Date(loginAt.getTime());
  const end = endAt.getTime();
  while (cursor.getTime() < end) {
    const key = localDateKey(cursor);
    const nextDay = new Date(
      cursor.getFullYear(),
      cursor.getMonth(),
      cursor.getDate() + 1,
      0,
      0,
      0,
      0,
    );
    const sliceEnd = Math.min(end, nextDay.getTime());
    const minutes = (sliceEnd - cursor.getTime()) / 60000;
    if (minutes > 0) {
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + minutes);
    }
    cursor = new Date(sliceEnd);
  }
}

const MAX_MINUTES_PER_DAY = 24 * 60;
const MAX_DAILY_BREAKDOWN_ROWS = 14;

export function buildDailyWorkBreakdown(
  sessions: SessionRow[],
  periodEnd: Date,
): DailyWorkTimeRow[] {
  const dayTotals = new Map<string, number>();
  const todayKey = localDateKey(periodEnd);

  for (const session of sessions) {
    const loginAt = new Date(session.loginAt);
    const endAt = session.logoutAt ? new Date(session.logoutAt) : periodEnd;
    if (endAt > loginAt) {
      allocateSessionToDays(loginAt, endAt, dayTotals);
    }
  }

  const rows: DailyWorkTimeRow[] = [...dayTotals.entries()]
    .map(([date, minutes]) => {
      const rawMinutes = Math.round(minutes);
      const totalMinutes = Math.min(rawMinutes, MAX_MINUTES_PER_DAY);
      const isToday = date === todayKey;
      const d = new Date(`${date}T12:00:00`);
      return {
        date,
        dayLabel: isToday
          ? 'Today'
          : d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' }),
        totalMinutes,
        totalFormatted: formatDuration(totalMinutes),
        isToday,
      };
    })
    .filter((row) => row.totalMinutes > 0 || row.isToday);

  const sorted = rows.sort((a, b) => {
    if (a.isToday) return -1;
    if (b.isToday) return 1;
    return b.date.localeCompare(a.date);
  });

  return sorted.slice(0, MAX_DAILY_BREAKDOWN_ROWS);
}

export function formatElapsedSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  }
  return `${m}:${String(sec).padStart(2, '0')}`;
}

/** Login→logout (or now) work time for a period; optional live session for current sessionId. */
export function buildWorkTimeSnapshot(
  logs: ActivityLogRow[],
  opts: { sessionId?: string; periodEnd?: Date } = {},
): WorkTimeSnapshot {
  const periodEnd = opts.periodEnd ?? new Date();
  const sessions = buildSessions(logs, periodEnd);
  const monthlyMinutes = sessions.reduce((sum, row) => sum + row.durationMinutes, 0);
  const dailyBreakdown = buildDailyWorkBreakdown(sessions, periodEnd);
  const todayRow = dailyBreakdown.find((d) => d.isToday);
  const todayMinutes = todayRow?.totalMinutes ?? 0;

  let currentSession: WorkTimeSnapshot['currentSession'] = null;
  if (opts.sessionId) {
    const active = sessions.find(
      (s) => s.sessionId === opts.sessionId && s.stillActive,
    );
    if (active) {
      const loginAt = new Date(active.loginAt);
      const elapsedSeconds = Math.max(
        0,
        Math.floor((periodEnd.getTime() - loginAt.getTime()) / 1000),
      );
      currentSession = {
        sessionId: active.sessionId,
        loginAt: active.loginAt,
        elapsedSeconds,
        elapsedFormatted: formatElapsedSeconds(elapsedSeconds),
        isActive: true,
      };
    }
  }

  return {
    monthlyMinutes,
    monthlyFormatted: formatDuration(monthlyMinutes),
    todayMinutes,
    todayFormatted: formatDuration(todayMinutes),
    dailyBreakdown,
    currentSession,
  };
}

export function buildEmployeeReport(
  logs: ActivityLogRow[],
  opts: {
    type: 'daily' | 'monthly';
    label: string;
    start: Date;
    end: Date;
    leadBatches?: BatchLeadSnapshot[];
    employee?: EmployeeReport['employee'];
  },
): EmployeeReport {
  const meaningfulLogs = logs.filter((l) => !isPassiveActivityAction(l.action));
  const sessions = buildSessions(logs, opts.end);
  const summary = buildSummary(meaningfulLogs, sessions);

  const activities = [...meaningfulLogs]
    .sort((a, b) => toDate(b).getTime() - toDate(a).getTime())
    .slice(0, 100)
    .map((l) => ({
      id: String(l._id ?? ''),
      action: l.action,
      path: l.path,
      ipAddress: l.ipAddress,
      createdAt: toDate(l).toISOString(),
    }));

  const report: EmployeeReport = {
    employee: opts.employee ?? { id: '', name: 'Unknown' },
    period: {
      type: opts.type,
      label: opts.label,
      start: opts.start.toISOString(),
      end: opts.end.toISOString(),
    },
    summary,
    sessions,
    activities,
  };

  report.leadActivity = buildLeadActivityReport(
    meaningfulLogs,
    opts.leadBatches ?? [],
  );

  if (opts.type === 'monthly') {
    const dayMap = new Map<string, ActivityLogRow[]>();
    for (const log of logs) {
      const key = toDate(log).toISOString().slice(0, 10);
      if (!dayMap.has(key)) dayMap.set(key, []);
      dayMap.get(key)!.push(log);
    }
    report.dailyBreakdown = [...dayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayLogs]) => {
        const daySessions = buildSessions(dayLogs, new Date(`${date}T23:59:59.999Z`));
        const daySummary = buildSummary(dayLogs, daySessions);
        return {
          date,
          loginCount: daySummary.loginCount,
          logoutCount: daySummary.logoutCount,
          totalActiveMinutes: daySummary.totalActiveMinutes,
          totalActiveFormatted: daySummary.totalActiveFormatted,
        };
      });
  }

  return report;
}

export function dayBounds(dateStr: string): { start: Date; end: Date; label: string } {
  const start = new Date(`${dateStr}T00:00:00.000`);
  const end = new Date(`${dateStr}T23:59:59.999`);
  const label = start.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return { start, end, label };
}

export function monthBounds(year: number, month: number): { start: Date; end: Date; label: string } {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const label = start.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  return { start, end, label };
}
