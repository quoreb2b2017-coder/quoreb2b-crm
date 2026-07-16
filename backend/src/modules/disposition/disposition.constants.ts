export type DispositionKind =
  | 'do_not_call'
  | 'direct_voicemail'
  | 'call_after_3_months'
  | 'call_after_6_months';

/** Short sidebar / tree folder names (employee dropdown keeps full wording). */
export const DISPOSITION_KIND_LABELS: Record<DispositionKind, string> = {
  do_not_call: 'DNC',
  direct_voicemail: 'DO',
  call_after_3_months: '3M',
  call_after_6_months: '6M',
};

/** Top-level archive folders shown to Super Admin + DB Admin. */
export const DISPOSITION_TREE_KINDS: DispositionKind[] = [
  'do_not_call',
  'direct_voicemail',
  'call_after_3_months',
  'call_after_6_months',
];

/**
 * Employee dropdown values:
 * - Lead → QC
 * - Voicemail / Not Interested → update row only (stay on campaign)
 * - Callback → update row + reminder setup
 * - Call after 3 / 6 months → update row + month folder for Super Admin / DB Admin
 * - Do Not Call → DNC archive database
 */
export const EMPLOYEE_DISPOSITION_OPTIONS = [
  'Lead',
  'Voicemail',
  'Callback',
  'Call after 3 months',
  'Call after 6 months',
  'Do Not Call',
  'Not Interested',
] as const;

/** Due calendar month/year when employee picks Call after N months. */
export function duePeriodFromNow(monthsAhead: number): {
  batchMonth: number;
  batchYear: number;
} {
  const d = new Date();
  d.setMonth(d.getMonth() + monthsAhead);
  return {
    batchMonth: d.getMonth() + 1,
    batchYear: d.getFullYear(),
  };
}

export function monthsAheadForDispositionKind(kind: DispositionKind): number | null {
  if (kind === 'call_after_3_months') return 3;
  if (kind === 'call_after_6_months') return 6;
  return null;
}
