/** On-time attendance cutoff — 6:30 PM */
export const ATTENDANCE_ON_TIME_CUTOFF = '18:30';
export const ATTENDANCE_ON_TIME_LABEL = '6:30 PM';

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isLateCheckIn(time: string, cutoff = ATTENDANCE_ON_TIME_CUTOFF): boolean {
  return timeToMinutes(time) > timeToMinutes(cutoff);
}

export function formatTime12h(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function currentTimeHHmm(): string {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}
