import { IDLE_TIMEOUT_MINUTES } from '@/lib/constants/session';

export const ACTIVITY_ACTION_LABELS: Record<string, string> = {
  LOGIN: 'Logged in',
  LOGOUT: 'Logged out',
  IDLE_LOGOUT: `Auto logout (${IDLE_TIMEOUT_MINUTES} min idle)`,
  IDLE_WARNING: 'Idle warning shown',
  USER_ACTIVE: 'Activity resumed',
  IDLE_DISMISSED: 'Idle warning dismissed',
  MASTER_DATA_UPLOAD: 'Master data uploaded',
  MASTER_DATA_REPLACE: 'Master data replaced',
  MASTER_DATA_APPEND: 'Master data appended',
  MASTER_DATA_CLEAR: 'Master data cleared',
  MASTER_DATA_SHARE_DBA: 'Master data shared with DB admin',
  BATCH_CREATE: 'Batch created',
  BATCH_UPDATE: 'Batch updated',
  BATCH_SHARE: 'Batch shared',
  BATCH_DELETE: 'Batch deleted',
  LEAD_UPDATE: 'Lead updated',
  LEAD_TOUCH: 'Lead opened / edited',
  LEAD_VIEW: 'Batch opened',
  VIEW_USER_PASSWORD: 'Viewed user password',
  USER_CREATE: 'User created',
  USER_STATUS_CHANGE: 'User status changed',
  USER_DELETE: 'User deleted',
  API_REQUEST: 'API action',
};

export function formatActivityAction(action: string): string {
  return ACTIVITY_ACTION_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase();
}
