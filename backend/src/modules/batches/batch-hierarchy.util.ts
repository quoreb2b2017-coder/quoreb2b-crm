import { SystemRole } from '../../common/constants/roles.constant';

export type HierarchyRole = 'admin' | 'db_admin' | 'employee';

export interface HierarchyUserRef {
  id: string;
  name: string;
  email: string;
  employeeId?: string;
  role: HierarchyRole;
}

export interface DistributedBatchRef {
  id: string;
  name: string;
  rowCount: number;
  columnCount: number;
  createdAt: string;
  sharedWithCount: number;
  sourceBatchId?: string;
}

export interface ActivitySummary {
  views: number;
  touches: number;
  updates: number;
  batchCreates: number;
  shares: number;
  lastActivityAt?: string;
}

export interface HierarchyActionItem {
  id: string;
  action: string;
  label: string;
  occurredAt: string;
  batchId?: string;
  batchName?: string;
  leadLabel?: string;
  metadata?: Record<string, unknown>;
}

export interface HierarchyShareRecipient {
  id: string;
  name: string;
  email: string;
  role: HierarchyRole;
}

export interface HierarchyShareEvent {
  id: string;
  sharerId: string;
  sharerName: string;
  sharerRole: HierarchyRole;
  batchId: string;
  batchName: string;
  rowCount: number;
  recipients: HierarchyShareRecipient[];
  occurredAt: string;
}

export interface HierarchyMemberNode {
  user: HierarchyUserRef;
  /** Rows this person received (child batch) or full batch if shared only */
  dataRows: number;
  accessType: 'full_share' | 'distributed_batch' | 'creator';
  distributedBatches: DistributedBatchRef[];
  activity: ActivitySummary;
  /** Employees under this DB admin (from their distributed batches) */
  team: HierarchyMemberNode[];
  /** DB admin → employee shares (visible to admin) */
  shareEvents?: HierarchyShareEvent[];
}

export interface BatchHierarchyResult {
  root: {
    id: string;
    name: string;
    rowCount: number;
    columnCount: number;
    monthLabel?: string;
    batchMonth?: number;
    batchYear?: number;
    createdAt: string;
    createdByName?: string;
  };
  creator?: HierarchyUserRef;
  /** DB admins + their team */
  tree: HierarchyMemberNode[];
  /** Employees shared directly on root (not via DB admin child batch) */
  directEmployees: HierarchyMemberNode[];
  /** All share actions in this batch tree (admin audit) */
  shareEvents: HierarchyShareEvent[];
}

export function primaryRole(roles: string[]): HierarchyRole {
  if (roles.includes(SystemRole.ADMIN) || roles.includes(SystemRole.SUPER_ADMIN)) {
    return 'admin';
  }
  if (roles.includes(SystemRole.DB_ADMIN)) return 'db_admin';
  return 'employee';
}

export function displayUserName(
  firstName?: string,
  lastName?: string,
  email?: string,
  fallback?: string,
): string {
  const n = [firstName, lastName].filter(Boolean).join(' ').trim();
  return n || email || fallback || 'Unknown';
}
