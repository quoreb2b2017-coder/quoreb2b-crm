export const EMPLOYEE_DISPOSITION_OPTIONS = [
  '',
  'Active',
  'Lead',
  'Won',
  'Do Not Call',
  'Direct Voicemail',
] as const;

export type DispositionKind = 'do_not_call' | 'direct_voicemail';

export const DISPOSITION_KIND_LABELS: Record<DispositionKind, string> = {
  do_not_call: 'Do Not Call',
  direct_voicemail: 'Direct Voicemail',
};

export function isStatusDispositionColumn(header: string): boolean {
  const lower = header.trim().toLowerCase();
  return lower === 'status' || lower === 'disposition';
}
