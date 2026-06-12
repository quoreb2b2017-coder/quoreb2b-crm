import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { workspaceDayDiff } from '@/lib/datetime';
import type { NotePriority } from '@/types/personal-notes';

export const PRIORITY_META: Record<
  NotePriority,
  {
    label: string;
    dot: string;
    badge: string;
    stripe: string;
    softBg: string;
    text: string;
  }
> = {
  high: {
    label: 'High',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 ring-rose-200/80',
    stripe: 'bg-rose-500',
    softBg: 'bg-rose-50/60',
    text: 'text-rose-700',
  },
  medium: {
    label: 'Medium',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 ring-amber-200/80',
    stripe: 'bg-amber-400',
    softBg: 'bg-amber-50/50',
    text: 'text-amber-800',
  },
  low: {
    label: 'Low',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-200/80',
    stripe: 'bg-emerald-500',
    softBg: 'bg-emerald-50/40',
    text: 'text-emerald-700',
  },
};

export function stripHtml(html: string): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Strip quick-note datetime stamp from saved content for clean previews */
export function stripNoteStamp(text: string): string {
  if (!text) return '';
  return text
    .replace(/^\[[\w\s,:/\-]+\]\s*/i, '')
    .replace(/^\[[\w\s,:/\-]+\]\s*\n+/i, '')
    .trim();
}

export function notePreviewText(content: string, maxLen = 80): string {
  const plain = stripNoteStamp(stripHtml(content));
  if (!plain) return '';
  return plain.length > maxLen ? `${plain.slice(0, maxLen)}…` : plain;
}

function parseNoteDate(iso: string | Date | null | undefined): Date | null {
  if (!iso) return null;
  const d = iso instanceof Date ? iso : new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatNoteDateTime(iso: string | Date | null | undefined): string {
  const d = parseNoteDate(iso);
  if (!d) return '—';
  return d.toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function formatNoteDateParts(iso: string | Date | null | undefined): {
  date: string;
  time: string;
} {
  const d = parseNoteDate(iso);
  if (!d) return { date: '—', time: '—' };
  return {
    date: d.toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
  };
}

export function formatNoteDate(iso: string | null | undefined): string {
  const d = parseNoteDate(iso);
  if (!d) return '—';
  const diffDays = workspaceDayDiff(d);

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-US', { timeZone: WORKSPACE_TIMEZONE,  hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return d.toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE,  weekday: 'short' });
  }
  return d.toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  });
}

export function formatReminder(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
