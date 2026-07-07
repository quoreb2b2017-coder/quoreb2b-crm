import { fingerprintLeadRow } from '../activity-logs/lead-identify.util';

export interface BatchRef {
  id: string;
  name: string;
}

export interface MasterBatchCoverageResult {
  summary: {
    totalRows: number;
    batchedRows: number;
    availableRows: number;
    batchesFromMaster: number;
  };
  /** Master row index (string key) → batches that include this row */
  batchedByRow: Record<string, BatchRef[]>;
}

type BatchLike = {
  _id?: { toString(): string };
  id?: string;
  name: string;
  headers?: string[];
  rows?: string[][];
  sourceBatchId?: { toString(): string } | string | null;
  masterSourceRowIndices?: number[];
};

function batchId(b: BatchLike): string {
  return b._id?.toString?.() ?? String(b.id ?? '');
}

function addBatchToRow(
  map: Map<number, BatchRef[]>,
  rowIndex: number,
  ref: BatchRef,
): void {
  const list = map.get(rowIndex) ?? [];
  if (!list.some((x) => x.id === ref.id)) list.push(ref);
  map.set(rowIndex, list);
}

/** Which master rows already exist in batches (data stays in master; this is visibility only). */
export function buildMasterBatchCoverage(
  masterHeaders: string[],
  masterRows: string[][],
  batches: BatchLike[],
  totalRowCount?: number,
): MasterBatchCoverageResult {
  const batchedMap = new Map<number, BatchRef[]>();
  const fromMaster = batches.filter((b) => !b.sourceBatchId);
  const rowTotal = totalRowCount ?? masterRows.length;

  for (const batch of fromMaster) {
    const ref: BatchRef = { id: batchId(batch), name: batch.name };
    const indices = batch.masterSourceRowIndices;
    if (indices?.length) {
      for (const idx of indices) {
        if (idx >= 0 && idx < rowTotal) addBatchToRow(batchedMap, idx, ref);
      }
      continue;
    }

    // Legacy fallback: fingerprint match only when batch rows are loaded (avoid O(n*m) on millions)
    if (!batch.rows?.length || !batch.headers?.length) continue;

    for (let bi = 0; bi < batch.rows.length; bi++) {
      const fp = fingerprintLeadRow(batch.headers, batch.rows[bi], bi);
      for (let mi = 0; mi < masterRows.length; mi++) {
        const mfp = fingerprintLeadRow(masterHeaders, masterRows[mi], mi);
        if (mfp.leadKey === fp.leadKey) addBatchToRow(batchedMap, mi, ref);
      }
    }
  }

  const batchedByRow: Record<string, BatchRef[]> = {};
  for (const [idx, refs] of batchedMap) {
    batchedByRow[String(idx)] = refs;
  }

  const batchedRows = batchedMap.size;
  return {
    summary: {
      totalRows: rowTotal,
      batchedRows,
      availableRows: Math.max(0, rowTotal - batchedRows),
      batchesFromMaster: fromMaster.length,
    },
    batchedByRow,
  };
}
