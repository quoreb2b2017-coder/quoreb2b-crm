import apiClient from './client';
import { deduplicatedFetch, clearCache } from './cache';

export interface CrmDashboardStats {
  totalUsers: number;
  newUsersThisMonth: number;
  totalLeads: number;
  activeLeads: number;
  statusLeads: number;
}

export interface StatusBreakdownItem {
  label: string;
  count: number;
  pct: number;
}

export interface ChartData {
  statusBreakdown: StatusBreakdownItem[];
  totalLeads: number;
}

export async function fetchCrmDashboardStats(): Promise<CrmDashboardStats> {
  return deduplicatedFetch('analytics:dashboard', async () => {
    const { data } = await apiClient.get('/analytics/dashboard');
    return (data?.data ?? data) as CrmDashboardStats;
  });
}

export async function fetchChartData(): Promise<ChartData> {
  return deduplicatedFetch('analytics:charts', async () => {
    const { data } = await apiClient.get('/analytics/charts');
    return (data?.data ?? data) as ChartData;
  });
}

export interface DbAdminDashboardData {
  health: {
    status: string;
    mongo: string;
    mongoState?: string;
    redis: string;
    elasticsearch: string;
  };
  batches: {
    total: number;
    owned: number;
    sharedWithMe: number;
    totalRows: number;
    activeLeads: number;
    wonLeads: number;
    employeesShared: number;
  };
  masterData: {
    totalRows: number;
    batchedRows: number;
    availableRows: number;
    batchesFromMaster: number;
  } | null;
  recentBatches: Array<{
    id: string;
    name: string;
    rowCount: number;
    isOwner: boolean;
    sharedCount: number;
    batchMonth?: number;
    batchYear?: number;
    updatedAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    resource: string;
    path?: string;
    batchName?: string;
    occurredAt: string;
  }>;
}

export async function fetchDbAdminDashboard(): Promise<DbAdminDashboardData> {
  return deduplicatedFetch('analytics:db-admin-dashboard', async () => {
    const { data } = await apiClient.get('/analytics/db-admin-dashboard');
    return (data?.data ?? data) as DbAdminDashboardData;
  });
}

export interface EmployeeDashboardData {
  user: { name: string; email?: string; employeeId?: string };
  period: { monthLabel: string; todayLabel: string; year: number; month: number };
  batches: {
    total: number;
    totalRows: number;
    totalLeads: number;
    activeLeads: number;
    wonLeads: number;
  };
  workThisMonth: {
    touched: number;
    updated: number;
    touchedOnly: number;
    notTouched: number;
    periodWorkedLeads: number;
    leadActions: number;
  };
  today: { actions: number; leadActions: number; leadsWorked: number };
  statusBreakdown: Array<{ label: string; count: number; pct: number }>;
  recentBatches: Array<{
    id: string;
    name: string;
    rowCount: number;
    batchMonth?: number;
    batchYear?: number;
    updatedAt: string;
  }>;
  recentActivity: Array<{
    id: string;
    action: string;
    resource: string;
    path?: string;
    batchName?: string;
    occurredAt: string;
  }>;
}

export async function fetchEmployeeDashboard(): Promise<EmployeeDashboardData> {
  return deduplicatedFetch('analytics:employee-dashboard', async () => {
    const { data } = await apiClient.get('/analytics/employee-dashboard');
    return (data?.data ?? data) as EmployeeDashboardData;
  });
}
