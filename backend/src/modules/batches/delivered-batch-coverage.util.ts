import { fingerprintLeadRow } from '../activity-logs/lead-identify.util';
import type { BatchRef, MasterBatchCoverageResult } from './master-batch-coverage.util';

export type DeliveredBatchCoverageResult = MasterBatchCoverageResult;

type BatchLike = {
  _id?: { toString(): string };
  id?: string;
  name: string;
  headers: string[];
  rows: string[][];
  deliveredSourceRowIndices?: number[];
  suppressionSourceRowIndices?: number[];
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

/** Which delivered-file rows already exist in delivered batches. */
export function buildDeliveredBatchCoverage(
  deliveredHeaders: string[],
  deliveredRows: string[][],
  batches: BatchLike[],
): DeliveredBatchCoverageResult {
  const batchedMap = new Map<number, BatchRef[]>();

  for (const batch of batches) {
    const ref: BatchRef = { id: batchId(batch), name: batch.name };
    const indices = batch.suppressionSourceRowIndices?.length
      ? batch.suppressionSourceRowIndices
      : batch.deliveredSourceRowIndices;
    if (indices?.length) {
      for (const idx of indices) {
        if (idx >= 0 && idx < deliveredRows.length) addBatchToRow(batchedMap, idx, ref);
      }
      continue;
    }

    for (let bi = 0; bi < batch.rows.length; bi++) {
      const fp = fingerprintLeadRow(batch.headers, batch.rows[bi], bi);
      for (let di = 0; di < deliveredRows.length; di++) {
        const dfp = fingerprintLeadRow(deliveredHeaders, deliveredRows[di], di);
        if (fp.leadKey === dfp.leadKey) addBatchToRow(batchedMap, di, ref);
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
      totalRows: deliveredRows.length,
      batchedRows,
      availableRows: Math.max(0, deliveredRows.length - batchedRows),
      batchesFromMaster: batches.length,
    },
    batchedByRow,
  };
}
