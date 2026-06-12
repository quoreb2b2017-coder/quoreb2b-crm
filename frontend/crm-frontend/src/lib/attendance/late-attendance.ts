import { SHIFT_LOGIN_LABEL, SHIFT_LOGIN_TIME } from '@/lib/attendance/attendance-shift.constants';

/** On-time login / check-in cutoff — 9:00 AM Eastern */
export const ATTENDANCE_ON_TIME_CUTOFF = SHIFT_LOGIN_TIME;
export const ATTENDANCE_ON_TIME_LABEL = SHIFT_LOGIN_LABEL;

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function isLateCheckIn(time: string, cutoff = ATTENDANCE_ON_TIME_CUTOFF): boolean {
  return timeToMinutes(time) > timeToMinutes(cutoff);
}

/** Display label — late check-in stays Present with (Late) suffix. */
export function formatAttendanceStatusLabel(
  status?: string,
  isLate?: boolean,
  isPaidLeave?: boolean,
): string {
  const raw = (status ?? '').toLowerCase();
  if (raw === 'leave' && isPaidLeave) return 'Paid Leave';
  if (isLate && raw === 'present') return 'Present (Late)';
  if (isLate && raw === 'half-day') return 'Half Day (Late)';
  switch (raw) {
    case 'present':
      return 'Present';
    case 'absent':
      return 'Absent';
    case 'leave':
      return 'Leave';
    case 'half-day':
      return 'Half Day';
    case 'weekend':
      return 'Weekend';
    case 'holiday':
      return 'Holiday';
    default:
      if (!raw) return '—';
      return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
}

/** Parse "8:30 AM" → "08:30" for API */
export function parseTime12hToHHmm(time12: string): string {
  const m = time12.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return '09:00';
  let h = parseInt(m[1], 10);
  const min = m[2];
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
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
