import {
  DISPOSITION_KIND_LABELS,
  DispositionKind,
  monthsAheadForDispositionKind,
} from './disposition.constants';
import { readEffectiveStatusValue } from '../activity-logs/sheet-lead-stats.util';

export function readRowDisposition(headers: string[], row: string[]): string {
  return readEffectiveStatusValue(headers, row);
}

/** Map employee disposition text → archive kind (or null if not archived). */
export function classifyDispositionKind(raw: string): DispositionKind | null {
  const lower = raw.trim().toLowerCase();
  if (!lower || lower === '-') return null;

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

  // Historical Direct Voicemail archive rows still classify for read/tree;
  // new Voicemail marks are local-only and must NOT enqueue.
  if (
    lower === 'direct voicemail' ||
    lower === 'direct voice mail' ||
    lower === 'direct vm'
  ) {
    return 'direct_voicemail';
  }

  if (
    lower === 'call after 3 months' ||
    lower === 'call after 3 month' ||
    lower === 'call after3 months' ||
    lower === 'callback after 3 months'
  ) {
    return 'call_after_3_months';
  }

  if (
    lower === 'call after 6 months' ||
    lower === 'call after 6 month' ||
    lower === 'call after6 months' ||
    lower === 'callback after 6 months'
  ) {
    return 'call_after_6_months';
  }

  return null;
}

/** Statuses that stay on the campaign sheet only (no QC / no DNC archive). */
export function isLocalOnlyDisposition(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  if (!lower || lower === '-') return false;
  if (
    lower === 'voicemail' ||
    lower === 'voice mail' ||
    lower === 'vm' ||
    lower === 'not interested' ||
    lower === 'not-interested' ||
    lower === 'ni' ||
    lower === 'callback' ||
    lower === 'call back' ||
    lower === 'call-back'
  ) {
    return true;
  }
  return false;
}

export function isCallbackDisposition(raw: string): boolean {
  const lower = raw.trim().toLowerCase();
  return lower === 'callback' || lower === 'call back' || lower === 'call-back';
}

export function isScheduledCallDisposition(raw: string): boolean {
  return (
    classifyDispositionKind(raw) === 'call_after_3_months' ||
    classifyDispositionKind(raw) === 'call_after_6_months'
  );
}

export function isDispositionMarked(headers: string[], row: string[]): boolean {
  const value = readRowDisposition(headers, row);
  const kind = classifyDispositionKind(value);
  return (
    kind === 'do_not_call' ||
    kind === 'direct_voicemail' ||
    kind === 'call_after_3_months' ||
    kind === 'call_after_6_months'
  );
}

/** Should this status change create / update a DispositionEntry archive row? */
export function shouldEnqueueDispositionArchive(raw: string): boolean {
  const kind = classifyDispositionKind(raw);
  return (
    kind === 'do_not_call' ||
    kind === 'call_after_3_months' ||
    kind === 'call_after_6_months'
  );
}

export function dispositionArchiveLabel(kind: DispositionKind): string {
  return DISPOSITION_KIND_LABELS[kind] ?? kind;
}

export { monthsAheadForDispositionKind };
