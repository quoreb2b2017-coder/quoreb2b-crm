export const EMPLOYEE_DISPOSITION_OPTIONS = [
  '',
  'Lead',
  'Voicemail',
  'Callback',
  'Call after 3 months',
  'Call after 6 months',
  'Do Not Call',
  'Not Interested',
] as const;

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

/** Full names for tooltips / hover (sidebar shows short labels). */
export const DISPOSITION_KIND_TITLES: Record<DispositionKind, string> = {
  do_not_call: 'Do Not Call',
  direct_voicemail: 'Direct Voicemail',
  call_after_3_months: 'Call after 3 months',
  call_after_6_months: 'Call after 6 months',
};

/** @deprecated Status is email-only — use isDispositionColumn for the call dropdown. */
export function isStatusDispositionColumn(header: string): boolean {
  return isDispositionColumn(header);
}

/** Call-outcome column only — never treat Email "Status" as disposition. */
export function isDispositionColumn(header: string): boolean {
  return header.trim().toLowerCase() === 'disposition';
}

export function isCallbackDisposition(raw: string): boolean {
  const lower = (raw ?? '').trim().toLowerCase();
  return lower === 'callback' || lower === 'call back' || lower === 'call-back';
}

export function isScheduledCallDisposition(raw: string): boolean {
  const lower = (raw ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return (
    lower === 'call after 3 months' ||
    lower === 'call after 3 month' ||
    lower === 'call after 6 months' ||
    lower === 'call after 6 month'
  );
}

/** Row highlight by disposition / status value (Excel-readable). */
export type DispositionRowTone =
  | 'lead'
  | 'voicemail'
  | 'callback'
  | 'call_after'
  | 'do_not_call'
  | 'not_interested'
  | 'active'
  | 'won'
  | 'direct_voicemail'
  | null;

export function classifyDispositionRowTone(raw: string): DispositionRowTone {
  const lower = (raw ?? '').trim().toLowerCase();
  if (!lower || lower === '-') return null;
  if (lower === 'lead' || lower === 'leads') return 'lead';
  if (
    lower === 'voicemail' ||
    lower === 'voice mail' ||
    lower === 'vm' ||
    lower === 'direct voicemail' ||
    lower === 'direct voice mail' ||
    lower === 'direct vm'
  ) {
    return 'voicemail';
  }
  if (isCallbackDisposition(lower)) return 'callback';
  if (isScheduledCallDisposition(lower)) return 'call_after';
  if (
    lower === 'do not call' ||
    lower === 'donot call' ||
    lower === 'do-not-call' ||
    lower === 'dnc' ||
    lower === "don't call" ||
    lower === 'dont call'
  ) {
    return 'do_not_call';
  }
  if (
    lower === 'not interested' ||
    lower === 'not-interested' ||
    lower === 'ni'
  ) {
    return 'not_interested';
  }
  if (lower === 'active') return 'active';
  if (lower === 'won' || lower === 'closed won' || lower === 'closed-won' || lower.includes('won')) {
    return 'won';
  }
  return null;
}

/** Prefer Disposition column when present, else Status. */
export function readDispositionDisplayValue(headers: string[], row: string[]): string {
  const statusIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'status');
  const dispIdx = headers.findIndex((h) => h.trim().toLowerCase() === 'disposition');
  const statusVal = statusIdx >= 0 ? (row[statusIdx] ?? '').trim() : '';
  const dispVal = dispIdx >= 0 ? (row[dispIdx] ?? '').trim() : '';
  if (dispVal && dispVal !== '-') return dispVal;
  if (statusVal && statusVal !== '-') return statusVal;
  return dispVal || statusVal || '';
}

export function dispositionRowToneClass(tone: DispositionRowTone): string {
  switch (tone) {
    case 'lead':
    case 'won':
      return 'bg-[#e2efda] hover:bg-[#d4e8cc]'; // light green
    case 'do_not_call':
      return 'bg-[#fecaca] hover:bg-[#fca5a5]'; // light red
    case 'voicemail':
    case 'direct_voicemail':
      return 'bg-[#f1f5f9] hover:bg-[#e2e8f0]'; // plain stay-in-place
    case 'callback':
      return 'bg-[#fef3c7] hover:bg-[#fde68a]'; // amber reminder
    case 'call_after':
      return 'bg-[#e0e7ff] hover:bg-[#c7d2fe]'; // indigo scheduled
    case 'not_interested':
      return 'bg-[#f8fafc] hover:bg-[#f1f5f9]'; // stay-in-place
    case 'active':
      return 'bg-[#deecf9] hover:bg-[#d0e4f7]';
    default:
      return '';
  }
}
