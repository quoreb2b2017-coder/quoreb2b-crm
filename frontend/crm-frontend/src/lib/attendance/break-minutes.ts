import type { BreakPunchToday } from '@/lib/api/break-punch.service';

export function completedBreakMinutesFromToday(data: BreakPunchToday): number {
  return (
    data.tea.usedMinutesCompleted +
    data.lunch.usedMinutesCompleted +
    data.meeting.usedMinutesCompleted
  );
}

/** All punched breaks (tea + lunch + meeting) — for login-span / gross gap detection. */
export function totalBreakMinutesFromToday(data: BreakPunchToday): number {
  return data.tea.usedMinutes + data.lunch.usedMinutes + data.meeting.usedMinutes;
}

/** Tea + lunch only — deducted from Working (7h 45m). Meeting counts as work. */
export function workDeductibleBreakMinutesFromToday(data: BreakPunchToday): number {
  return data.tea.usedMinutes + data.lunch.usedMinutes;
}

export function workDeductibleBreakMinutesCompletedFromToday(data: BreakPunchToday): number {
  return data.tea.usedMinutesCompleted + data.lunch.usedMinutesCompleted;
}

export function dispatchBreakPunchState(active: boolean): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('break-punch:state', { detail: { active } }));
}
