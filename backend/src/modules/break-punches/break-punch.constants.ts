export const BREAK_TYPES = ['tea', 'lunch', 'meeting'] as const;
export type BreakType = (typeof BREAK_TYPES)[number];

/** Deducted from Working (7h 45m) only — meeting counts as work time. */
export const WORK_DEDUCTIBLE_BREAK_TYPES: BreakType[] = ['tea', 'lunch'];

/** Daily time pool — user may punch in/out many times until minutes run out */
export const BREAK_LIMITS: Record<
  BreakType,
  { dailyBudgetMinutes: number; label: string; hint: string }
> = {
  tea: { dailyBudgetMinutes: 30, label: 'Tea break', hint: '2×15m' },
  lunch: { dailyBudgetMinutes: 45, label: 'Lunch break', hint: '45m' },
  meeting: { dailyBudgetMinutes: 60, label: 'Meeting', hint: '60m' },
};