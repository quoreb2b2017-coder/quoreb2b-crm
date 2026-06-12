import { todayDateKeyIst } from '@/lib/attendance/ist-date';

const STORAGE_KEY = 'crm-today-work-gross';

type TodayWorkCache = {
  dateKey: string;
  grossMinutes: number;
};

/** Persist today's gross work minutes so re-login same day can resume the total. */
export function stashTodayWorkGross(
  grossMinutes: number,
  dateKey: string = todayDateKeyIst(),
): void {
  if (typeof sessionStorage === 'undefined') return;
  if (!Number.isFinite(grossMinutes) || grossMinutes < 0) return;
  const payload: TodayWorkCache = { dateKey, grossMinutes: Math.round(grossMinutes) };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function readTodayWorkGross(dateKey: string = todayDateKeyIst()): number | null {
  if (typeof sessionStorage === 'undefined') return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TodayWorkCache;
    if (parsed.dateKey !== dateKey) return null;
    return typeof parsed.grossMinutes === 'number' ? parsed.grossMinutes : null;
  } catch {
    return null;
  }
}
