/** Passive / navigation noise — not stored in activity logs */
export const PASSIVE_ACTIVITY_ACTIONS = new Set([
  'PAGE_VIEW',
  'SESSION_HEARTBEAT',
  'NAV_CLICK',
]);

export function isPassiveActivityAction(action: string): boolean {
  return PASSIVE_ACTIVITY_ACTIONS.has(action);
}

export function isRecordableTrackAction(action: string): boolean {
  return action.length > 0 && !isPassiveActivityAction(action);
}
