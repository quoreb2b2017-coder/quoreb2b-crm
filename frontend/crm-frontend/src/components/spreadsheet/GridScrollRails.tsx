'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils/cn';

interface ScrollMetrics {
  scrollLeft: number;
  scrollTop: number;
  scrollWidth: number;
  scrollHeight: number;
  clientWidth: number;
  clientHeight: number;
}

interface GridScrollRailsProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** Rows currently rendered in the grid */
  displayRowCount: number;
  /** Full dataset size for 0…N scrubber (defaults to displayRowCount) */
  datasetRowCount?: number;
  /** Global 0-based index of the first rendered row (pagination offset) */
  datasetRowOffset?: number;
  /** Jump to a global row index (pagination / large datasets) */
  onDatasetRowSeek?: (globalRowIndex: number) => void;
  className?: string;
}

function useTrackPointer(
  trackRef: React.RefObject<HTMLDivElement | null>,
  onRatio: (ratio: number) => void,
) {
  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;

    let dragging = false;

    const ratioAt = (clientX: number) => {
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return 0;
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    };

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      dragging = true;
      track.setPointerCapture(e.pointerId);
      onRatio(ratioAt(e.clientX));
    };

    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      e.preventDefault();
      onRatio(ratioAt(e.clientX));
    };

    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      try {
        track.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };

    track.addEventListener('pointerdown', onDown);
    track.addEventListener('pointermove', onMove);
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);

    return () => {
      track.removeEventListener('pointerdown', onDown);
      track.removeEventListener('pointermove', onMove);
      track.removeEventListener('pointerup', end);
      track.removeEventListener('pointercancel', end);
    };
  }, [trackRef, onRatio]);
}

export function GridScrollRails({
  containerRef,
  displayRowCount,
  datasetRowCount,
  datasetRowOffset = 0,
  onDatasetRowSeek,
  className,
}: GridScrollRailsProps) {
  const rowTrackRef = useRef<HTMLDivElement>(null);
  const colTrackRef = useRef<HTMLDivElement>(null);

  const totalRows = Math.max(datasetRowCount ?? displayRowCount, displayRowCount, 0);
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    scrollLeft: 0,
    scrollTop: 0,
    scrollWidth: 0,
    scrollHeight: 0,
    clientWidth: 0,
    clientHeight: 0,
  });
  const [localRowIndex, setLocalRowIndex] = useState(0);

  const scrollToDisplayRow = useCallback(
    (displayRow: number) => {
      const el = containerRef.current;
      if (!el || displayRowCount <= 0) return;
      const row = Math.max(0, Math.min(displayRowCount - 1, displayRow));
      const cell = el.querySelector<HTMLElement>(`tbody td[data-grid-row="${row}"]`);
      if (!cell) return;
      const thead = el.querySelector('thead');
      const headerHeight = thead?.getBoundingClientRect().height ?? 0;
      el.scrollTop = Math.max(0, cell.offsetTop - headerHeight);
      setLocalRowIndex(row);
    },
    [containerRef, displayRowCount],
  );

  const seekGlobalRow = useCallback(
    (globalRow: number) => {
      const clamped = Math.max(0, Math.min(totalRows - 1, globalRow));
      const localRow = clamped - datasetRowOffset;

      if (localRow >= 0 && localRow < displayRowCount) {
        scrollToDisplayRow(localRow);
        return;
      }

      onDatasetRowSeek?.(clamped);
    },
    [
      datasetRowOffset,
      displayRowCount,
      onDatasetRowSeek,
      scrollToDisplayRow,
      totalRows,
    ],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const update = () => {
      setMetrics({
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
        scrollWidth: el.scrollWidth,
        scrollHeight: el.scrollHeight,
        clientWidth: el.clientWidth,
        clientHeight: el.clientHeight,
      });

      if (displayRowCount <= 0) {
        setLocalRowIndex(0);
        return;
      }

      const sample = el.querySelector<HTMLElement>('tbody td[data-grid-row="0"]');
      const rowHeight = sample?.offsetHeight || 28;
      const thead = el.querySelector('thead');
      const headerHeight = thead?.offsetHeight ?? 0;
      const approx = Math.round((el.scrollTop - headerHeight) / rowHeight);
      setLocalRowIndex(Math.max(0, Math.min(displayRowCount - 1, approx)));
    };

    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);

    return () => {
      el.removeEventListener('scroll', update);
      ro.disconnect();
    };
  }, [containerRef, displayRowCount, datasetRowOffset, totalRows]);

  const globalRow = totalRows > 0 ? datasetRowOffset + localRowIndex : 0;
  const rowRatio = totalRows > 1 ? globalRow / (totalRows - 1) : 0;

  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  const colRatio = maxScrollLeft > 0 ? metrics.scrollLeft / maxScrollLeft : 0;

  const onRowRatio = useCallback(
    (ratio: number) => {
      if (totalRows <= 1) return;
      const target = Math.round(ratio * (totalRows - 1));
      seekGlobalRow(target);
    },
    [seekGlobalRow, totalRows],
  );

  const onColRatio = useCallback(
    (ratio: number) => {
      const el = containerRef.current;
      if (!el || maxScrollLeft <= 0) return;
      el.scrollLeft = ratio * maxScrollLeft;
    },
    [containerRef, maxScrollLeft],
  );

  useTrackPointer(rowTrackRef, onRowRatio);
  useTrackPointer(colTrackRef, onColRatio);

  const showRowRail = totalRows > 1;
  const showColRail = maxScrollLeft > 4;

  if (!showRowRail && !showColRail) return null;

  return (
    <div className={cn('xl-scroll-rails', className)} data-no-drag-scroll>
      {showRowRail && (
        <div className="xl-scroll-rail xl-scroll-rail--rows">
          <span className="xl-scroll-rail__label">Row</span>
          <span className="xl-scroll-rail__value tabular-nums">
            {(globalRow + 1).toLocaleString('en-US')}
          </span>
          <div
            ref={rowTrackRef}
            className="xl-scroll-rail__track"
            role="slider"
            aria-valuemin={1}
            aria-valuemax={totalRows}
            aria-valuenow={globalRow + 1}
            aria-label="Scroll rows"
          >
            <div
              className="xl-scroll-rail__thumb"
              style={{ left: `calc(${rowRatio * 100}% - 7px)` }}
            />
          </div>
          <span className="xl-scroll-rail__total tabular-nums">
            {totalRows.toLocaleString('en-US')}
          </span>
        </div>
      )}
      {showColRail && (
        <div className="xl-scroll-rail xl-scroll-rail--cols">
          <span className="xl-scroll-rail__label">Columns</span>
          <div
            ref={colTrackRef}
            className="xl-scroll-rail__track"
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(colRatio * 100)}
            aria-label="Scroll columns"
          >
            <div
              className="xl-scroll-rail__thumb"
              style={{ left: `calc(${colRatio * 100}% - 7px)` }}
            />
          </div>
          <span className="xl-scroll-rail__hint">Drag ↔</span>
        </div>
      )}
    </div>
  );
}
