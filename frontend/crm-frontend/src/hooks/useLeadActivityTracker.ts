'use client';

import { useCallback, useRef } from 'react';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import { fingerprintLeadRow } from '@/lib/lead-track';

const DEBOUNCE_MS = 2500;
const seenKeys = new Map<string, number>();

function shouldSend(key: string): boolean {
  const now = Date.now();
  const last = seenKeys.get(key) ?? 0;
  if (now - last < DEBOUNCE_MS) return false;
  seenKeys.set(key, now);
  return true;
}

export function useLeadActivityTracker(batchId?: string, batchName?: string) {
  const enabled = Boolean(batchId && batchName);
  const batchViewLogged = useRef(false);

  const trackBatchOpen = useCallback(() => {
    if (!enabled || !batchId || batchViewLogged.current) return;
    batchViewLogged.current = true;
    void activityLogsService
      .track({
        action: 'LEAD_VIEW',
        resource: 'batch',
        resourceId: batchId,
        path: `/batch-view?id=${batchId}`,
        metadata: { batchId, batchName },
      })
      .catch(() => undefined);
  }, [enabled, batchId, batchName]);

  const trackLeadTouch = useCallback(
    (headers: string[], row: string[], rowIndex: number, colIndex?: number) => {
      if (!enabled || !batchId) return;
      const { leadKey, leadLabel } = fingerprintLeadRow(headers, row, rowIndex);
      const key = `${batchId}:${leadKey}`;
      if (!shouldSend(key)) return;
      void activityLogsService
        .track({
          action: 'LEAD_TOUCH',
          resource: 'lead',
          resourceId: `${batchId}:${leadKey}`,
          path: `/batch-view?id=${batchId}`,
          metadata: {
            batchId,
            batchName,
            rowIndex,
            leadKey,
            leadLabel,
            colIndex,
          },
        })
        .catch(() => undefined);
    },
    [enabled, batchId, batchName],
  );

  return { trackBatchOpen, trackLeadTouch, enabled };
}
