import { DispositionKind } from './disposition.constants';
import { readEffectiveStatusValue } from '../activity-logs/sheet-lead-stats.util';

export function readRowDisposition(headers: string[], row: string[]): string {
  return readEffectiveStatusValue(headers, row);
}

/** Only Do Not Call goes to the DNC disposition archive / database. */
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

export function isDispositionMarked(headers: string[], row: string[]): boolean {
  const value = readRowDisposition(headers, row);
  // Only archive DNC (and legacy Direct Voicemail). Plain Voicemail is local-only.
  const kind = classifyDispositionKind(value);
  return kind === 'do_not_call' || kind === 'direct_voicemail';
}

/** Should this status change create a new DispositionEntry? Only DNC going forward. */
export function shouldEnqueueDispositionArchive(raw: string): boolean {
  return classifyDispositionKind(raw) === 'do_not_call';
}
