import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import apiClient from './client';

export interface ActivityLogRow {
  id: string;
  userId?: string;
  userName: string;
  userEmail?: string;
  userRole: string;
  employeeId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  path?: string;
  metadata?: Record<string, unknown>;
  userAgent?: string;
  sessionId?: string;
  createdAt: string;
  dateFormatted: string;
}

export interface TrackActivityPayload {
  action: string;
  resource: string;
  path?: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
}

export interface ActivityLogStats {
  total: number;
  byAction: Array<{ action: string; count: number }>;
  timeline: Array<{ key: string; label: string; count: number }>;
  byUser: Array<{
    userId: string;
    count: number;
    name: string;
    email?: string;
  }>;
}

export interface ActivityLogsListParams {
  page?: number;
  limit?: number;
  role?: string;
  action?: string;
  search?: string;
  userId?: string;
  /** YYYY-MM-DD — daily view (today, etc.) */
  date?: string;
  year?: number;
  month?: number;
}

export interface PaginatedActivityLogs {
  data: ActivityLogRow[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface EmployeeReportSummary {
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

export interface EmployeeSessionRow {
  sessionId: string;
  loginAt: string;
  logoutAt?: string;
  logoutType?: 'LOGOUT' | 'IDLE_LOGOUT';
  durationMinutes: number;
  durationFormatted: string;
  logoutTime: string;
  stillActive?: boolean;
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
    touchedOnly?: number;
    viewedOnly: number;
    notTouched: number;
    batchCount: number;
    totalLeads: number;
    activeLeads: number;
    wonLeads: number;
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

export interface EmployeeReport {
  employee: {
    id: string;
    name: string;
    email?: string;
    employeeId?: string;
  };
  period: { type: 'daily' | 'monthly'; label: string; start: string; end: string };
  summary: EmployeeReportSummary;
  sessions: EmployeeSessionRow[];
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
    createdAt: string;
  }>;
  leadActivity: LeadActivityReport;
}

function unwrap<T>(data: unknown): T {
  const body = data as { data?: T };
  return (body?.data ?? data) as T;
}

const defaultListMeta = (items: unknown[], page = 1, limit = 50) => ({
  total: items.length,
  page,
  limit,
  totalPages: Math.max(1, Math.ceil(items.length / limit)),
  hasNextPage: false,
  hasPrevPage: page > 1,
});

function parseDateValue(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number' && !isNaN(value)) return new Date(value);
  if (typeof value === 'string') {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'object' && value !== null && '$date' in value) {
    const d = new Date(String((value as { $date: string | number }).$date));
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function formatActivityDate(value: unknown): { createdAt: string; dateFormatted: string } {
  const parsed = parseDateValue(value);
  if (!parsed) {
    return { createdAt: '', dateFormatted: '—' };
  }
  return {
    createdAt: parsed.toISOString(),
    dateFormatted: parsed.toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
      dateStyle: 'medium',
      timeStyle: 'short',
    }),
  };
}

function normalizeActivityLogRow(raw: Record<string, unknown>): ActivityLogRow {
  const meta = (raw.metadata as Record<string, unknown>) ?? {};
  const dateSource =
    raw.createdAt ??
    raw.occurredAt ??
    meta.recordedAt ??
    meta.loggedOutAt;
  const { createdAt, dateFormatted } = formatActivityDate(dateSource);
  const userEmail = (raw.userEmail as string) ?? (meta.email as string);
  const employeeId = (raw.employeeId as string) ?? (meta.employeeId as string);
  const storedName = raw.userName as string | undefined;
  const metaName = meta.userName as string | undefined;

  return {
    id: String(raw.id ?? raw._id ?? ''),
    userId: raw.userId ? String(raw.userId) : undefined,
    userName: String(
      storedName && storedName !== 'Unknown'
        ? storedName
        : metaName && metaName !== 'Unknown'
          ? metaName
          : userEmail ?? employeeId ?? 'Unknown',
    ),
    userEmail,
    userRole: String(raw.userRole ?? meta.role ?? 'unknown'),
    employeeId,
    action: String(raw.action ?? ''),
    resource: String(raw.resource ?? ''),
    resourceId: raw.resourceId as string | undefined,
    path: raw.path as string | undefined,
    metadata: meta,
    userAgent: raw.userAgent as string | undefined,
    sessionId: raw.sessionId as string | undefined,
    createdAt,
    dateFormatted: (raw.dateFormatted as string) || dateFormatted,
  };
}

function normalizeRows(rows: unknown[]): ActivityLogRow[] {
  return rows.map((row) =>
    normalizeActivityLogRow((row ?? {}) as Record<string, unknown>),
  );
}

function parsePaginatedActivityLogs(
  response: unknown,
  page = 1,
  limit = 50,
): PaginatedActivityLogs {
  const body = response as {
    success?: boolean;
    data?: ActivityLogRow[] | { data?: ActivityLogRow[]; meta?: PaginatedActivityLogs['meta'] };
    meta?: PaginatedActivityLogs['meta'];
  };

  // NestJS TransformInterceptor: { success, data: rows[], meta: pagination }
  if (Array.isArray(body.data) && body.meta) {
    return { data: normalizeRows(body.data), meta: body.meta };
  }

  const inner = body.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    const nested = inner as { data?: unknown[]; meta?: PaginatedActivityLogs['meta'] };
    if (Array.isArray(nested.data)) {
      const data = normalizeRows(nested.data);
      return {
        data,
        meta: nested.meta ?? defaultListMeta(data, page, limit),
      };
    }
  }

  if (Array.isArray(inner)) {
    const data = normalizeRows(inner);
    return { data, meta: defaultListMeta(data, page, limit) };
  }

  return { data: [], meta: defaultListMeta([], page, limit) };
}

const ROLE_LABELS: Record<string, string> = {
  admin: 'Super Admin',
  super_admin: 'Super Admin',
  employee: 'Employee',
  db_admin: 'DB Administrator',
  client: 'Client',
};

export function formatRoleLabel(role: string) {
  return ROLE_LABELS[role] ?? role;
}

export const activityLogsService = {
  track: (payload: TrackActivityPayload) =>
    apiClient.post('/activity-logs/track', payload),

  list: async (params?: ActivityLogsListParams): Promise<PaginatedActivityLogs> => {
    const page = params?.page ?? 1;
    const limit = params?.limit ?? 50;
    const { data } = await apiClient.get('/activity-logs', { params });
    return parsePaginatedActivityLogs(data, page, limit);
  },

  getStats: async (params?: Omit<ActivityLogsListParams, 'page' | 'limit'>): Promise<ActivityLogStats> => {
    const { data } = await apiClient.get('/activity-logs/stats', { params });
    const body = data as { data?: ActivityLogStats };
    return (body?.data ?? data) as ActivityLogStats;
  },

  getByUser: (userId: string) =>
    apiClient.get(`/activity-logs/user/${userId}`),

  getDailyReport: async (userId: string, date: string) => {
    const { data } = await apiClient.get(`/activity-logs/user/${userId}/report/daily`, {
      params: { date },
    });
    return unwrap<EmployeeReport>(data);
  },

  getMonthlyReport: async (userId: string, year: number, month: number) => {
    const { data } = await apiClient.get(`/activity-logs/user/${userId}/report/monthly`, {
      params: { year, month },
    });
    return unwrap<EmployeeReport>(data);
  },
};
