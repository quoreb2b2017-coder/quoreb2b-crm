import { WORKSPACE_TIMEZONE } from '../../common/constants/workspace-timezone.constant';

/** Resolve a reliable timestamp from a stored activity log document */
export function resolveActivityTimestamp(row: Record<string, unknown>): Date | null {
  const meta = (row.metadata as Record<string, unknown>) ?? {};
  const candidates: unknown[] = [
    row.occurredAt,
    row.createdAt,
    row.updatedAt,
    meta.recordedAt,
    meta.loggedOutAt,
  ];

  for (const value of candidates) {
    if (value == null || value === '') continue;
    if (value instanceof Date && !isNaN(value.getTime())) return value;
    if (typeof value === 'number' && !isNaN(value)) return new Date(value);
    if (typeof value === 'string') {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    if (typeof value === 'object' && value !== null && '$date' in value) {
      const d = new Date(String((value as { $date: string | number }).$date));
      if (!isNaN(d.getTime())) return d;
    }
  }

  return null;
}

export function formatActivityDateTime(row: Record<string, unknown>): {
  createdAt: string;
  dateFormatted: string;
} {
  const date = resolveActivityTimestamp(row);
  if (!date) {
    return { createdAt: '', dateFormatted: '—' };
  }
  return {
    createdAt: date.toISOString(),
    dateFormatted: date.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: WORKSPACE_TIMEZONE,
    }),
  };
}
