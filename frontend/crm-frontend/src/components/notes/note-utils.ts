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

export function formatNoteDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) {
    return d.toLocaleDateString('en-IN', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

export function formatReminder(iso: string | null | undefined): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}
