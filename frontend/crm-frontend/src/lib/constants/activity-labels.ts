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
  BATCH_CREATE: 'Campaign created',
  BATCH_UPDATE: 'Campaign updated',
  BATCH_SHARE: 'Campaign shared',
  BATCH_DELETE: 'Campaign deleted',
  LEAD_UPDATE: 'Lead updated',
  LEAD_TOUCH: 'Lead opened / edited',
  LEAD_VIEW: 'Campaign opened',
  VIEW_USER_PASSWORD: 'Viewed user password',
  ADMIN_RESET_USER_PASSWORD: 'Reset user password (admin)',
  USER_CREATE: 'User created',
  USER_STATUS_CHANGE: 'User status changed',
  USER_DELETE: 'User deleted',
  API_REQUEST: 'API action',
};

export function formatActivityAction(action: string): string {
  return ACTIVITY_ACTION_LABELS[action] ?? action.replace(/_/g, ' ').toLowerCase();
}

const AUTH_ACTIONS_WITH_ACTOR = new Set(['LOGIN', 'LOGOUT', 'IDLE_LOGOUT']);

/** Append user name on login/logout rows so it's clear who signed in or out. */
export function formatActivityActionForLog(
  action: string,
  options?: { userName?: string; showActorOnAuth?: boolean },
): string {
  const base = formatActivityAction(action);
  const name = options?.userName?.trim();
  if (!options?.showActorOnAuth || !name || name === 'Unknown') return base;
  if (AUTH_ACTIONS_WITH_ACTOR.has(action)) {
    return `${base} — ${name}`;
  }
  return base;
}

function safeCount(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export interface MasterUploadActivityMeta {
  fileName: string;
  fileRowCount: number;
  addedRows: number;
  duplicateCount: number;
  missingCount: number;
}

export function parseMasterUploadActivityMeta(
  metadata?: Record<string, unknown>,
): MasterUploadActivityMeta | null {
  if (!metadata) return null;
  const fileName = String(metadata.fileName ?? '').trim();
  const addedRows = safeCount(metadata.addedRows);
  const duplicateCount = safeCount(metadata.skippedDuplicates);
  const missingCount = safeCount(metadata.missingRowCount ?? metadata.skippedIncomplete);
  const fileRowCount = safeCount(
    metadata.fileRowCount ?? addedRows + duplicateCount + missingCount,
  );
  if (!fileName && !addedRows && !duplicateCount && !missingCount && !fileRowCount) {
    return null;
  }
  return {
    fileName: fileName || 'Master upload',
    fileRowCount,
    addedRows,
    duplicateCount,
    missingCount,
  };
}

/** Rich detail line for master upload rows in activity logs. */
export function formatMasterUploadActivityDetail(
  metadata?: Record<string, unknown>,
): string | null {
  const parsed = parseMasterUploadActivityMeta(metadata);
  if (!parsed) return null;
  const parts = [
    parsed.fileName,
    parsed.fileRowCount > 0 ? `${parsed.fileRowCount.toLocaleString('en-US')} in file` : null,
    `${parsed.addedRows.toLocaleString('en-US')} added`,
    `${parsed.duplicateCount.toLocaleString('en-US')} dup`,
    `${parsed.missingCount.toLocaleString('en-US')} missing`,
  ].filter(Boolean);
  return parts.join(' · ');
}
