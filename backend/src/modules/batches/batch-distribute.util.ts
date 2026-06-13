import { fingerprintLeadRow } from '../activity-logs/lead-identify.util';

export type BatchRowSlice = {
  headers: string[];
  rows: string[][];
  parentSourceRowIndices: number[];
};

type ChildBatchLike = {
  headers: string[];
  rows: string[][];
  parentSourceRowIndices?: number[];
};

/** Contiguous equal split — each bucket gets floor(n/k) or +1 rows; no duplicate indices. */
export function equalSplitIndices(indices: number[], bucketCount: number): number[][] {
  if (bucketCount <= 0) return [];
  if (indices.length === 0) return Array.from({ length: bucketCount }, () => []);

  const buckets: number[][] = Array.from({ length: bucketCount }, () => []);
  const base = Math.floor(indices.length / bucketCount);
  const remainder = indices.length % bucketCount;
  let pos = 0;

  for (let b = 0; b < bucketCount; b++) {
    const size = base + (b < remainder ? 1 : 0);
    buckets[b] = indices.slice(pos, pos + size);
    pos += size;
  }
  return buckets;
}

/** Parent row indices already assigned to child batches (no duplicates across children). */
export function assignedParentRowIndices(
  parentHeaders: string[],
  parentRows: string[][],
  childBatches: ChildBatchLike[],
): Set<number> {
  const assigned = new Set<number>();

  for (const child of childBatches) {
    const stored = child.parentSourceRowIndices;
    if (stored?.length) {
      for (const idx of stored) {
        if (idx >= 0 && idx < parentRows.length) assigned.add(idx);
      }
      continue;
    }

    for (let ci = 0; ci < child.rows.length; ci++) {
      const fp = fingerprintLeadRow(child.headers, child.rows[ci], ci);
      for (let pi = 0; pi < parentRows.length; pi++) {
        if (assigned.has(pi)) continue;
        const pfp = fingerprintLeadRow(parentHeaders, parentRows[pi], pi);
        if (pfp.leadKey === fp.leadKey) {
          assigned.add(pi);
          break;
        }
      }
    }
  }

  return assigned;
}

export function unassignedParentRowIndices(
  parentRowCount: number,
  assigned: Set<number>,
): number[] {
  const out: number[] = [];
  for (let i = 0; i < parentRowCount; i++) {
    if (!assigned.has(i)) out.push(i);
  }
  return out;
}

export function buildRowSlice(
  parentHeaders: string[],
  parentRows: string[][],
  indices: number[],
): BatchRowSlice {
  const headers = [...parentHeaders];
  const rows = indices.map((i) => [...parentRows[i]]);
  return { headers, rows, parentSourceRowIndices: [...indices] };
}

export function employeeDisplayName(user: {
  firstName?: string;
  lastName?: string;
  email?: string;
  employeeId?: string;
}): string {
  const name = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  if (name) return name;
  if (user.employeeId) return user.employeeId;
  return user.email?.split('@')[0] ?? 'Employee';
}
