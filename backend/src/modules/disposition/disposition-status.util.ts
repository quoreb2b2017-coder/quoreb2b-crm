import { DispositionKind } from './disposition.constants';
import { findStatusColumnIndex } from '../activity-logs/sheet-lead-stats.util';

export function readRowDisposition(headers: string[], row: string[]): string {
  const idx = findStatusColumnIndex(headers);
  if (idx < 0) return '';
  return (row[idx] ?? '').trim();
}

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

  if (
    lower === 'direct voicemail' ||
    lower === 'direct voice mail' ||
    lower === 'direct vm' ||
    lower === 'voicemail' ||
    lower === 'voice mail' ||
    lower === 'vm'
  ) {
    return 'direct_voicemail';
  }

  return null;
}

export function isDispositionMarked(headers: string[], row: string[]): boolean {
  const value = readRowDisposition(headers, row);
  return classifyDispositionKind(value) !== null;
}
