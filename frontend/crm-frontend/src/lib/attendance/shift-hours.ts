/** Default night shift: 7:00 PM → 4:00 AM (next calendar day) */
export const DEFAULT_SHIFT_CHECK_IN = '19:00';
export const DEFAULT_SHIFT_CHECK_OUT = '04:00';

export const SHIFT_LABEL = '7:00 PM – 4:00 AM';

/** Hours between check-in and check-out; adds 24h when checkout is after midnight. */
export function calculateShiftHours(checkInTime: string, checkOutTime: string): number {
  if (!checkInTime || !checkOutTime) return 0;
  const [inHour, inMin] = checkInTime.split(':').map(Number);
  const [outHour, outMin] = checkOutTime.split(':').map(Number);
  const inMinutes = inHour * 60 + inMin;
  let outMinutes = outHour * 60 + outMin;
  if (outMinutes <= inMinutes) {
    outMinutes += 24 * 60;
  }
  return Math.max(0, (outMinutes - inMinutes) / 60);
}
