export type DispositionKind = 'do_not_call' | 'direct_voicemail';

export const DISPOSITION_KIND_LABELS: Record<DispositionKind, string> = {
  do_not_call: 'Do Not Call',
  direct_voicemail: 'Direct Voicemail',
};

/**
 * Employee dropdown values:
 * - Lead → QC
 * - Voicemail / Not Interested → update row only (stay on campaign)
 * - Callback → update row + reminder setup
 * - Do Not Call → DNC archive database
 */
export const EMPLOYEE_DISPOSITION_OPTIONS = [
  'Lead',
  'Voicemail',
  'Callback',
  'Do Not Call',
  'Not Interested',
] as const;
