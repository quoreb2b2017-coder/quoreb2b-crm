/** Passive / navigation noise — not stored in activity logs */
export const PASSIVE_ACTIVITY_ACTIONS = new Set([
  'PAGE_VIEW',
  'SESSION_HEARTBEAT',
  'NAV_CLICK',
]);

/** Auth / session noise — hidden on CRM dashboards (recent activity widgets) */
export const AUTH_SESSION_ACTIVITY_ACTIONS = new Set([
  'LOGIN',
  'LOGOUT',
  'IDLE_LOGOUT',
  'IDLE_WARNING',
  'USER_ACTIVE',
  'IDLE_DISMISSED',
  'API_REQUEST',
]);

export const DASHBOARD_EXCLUDED_ACTIVITY_ACTIONS = new Set([
  ...PASSIVE_ACTIVITY_ACTIONS,
  ...AUTH_SESSION_ACTIVITY_ACTIONS,
]);

export function isPassiveActivityAction(action: string): boolean {
  return PASSIVE_ACTIVITY_ACTIONS.has(action);
}

export function isDashboardExcludedActivity(action: string): boolean {
  return DASHBOARD_EXCLUDED_ACTIVITY_ACTIONS.has(action);
}

export function isRecordableTrackAction(action: string): boolean {
  return action.length > 0 && !isPassiveActivityAction(action);
}
