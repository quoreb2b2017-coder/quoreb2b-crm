'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortCategoryOptions } from './master-database-columns';

interface CategoryRangeSliderProps {
  options: string[];
  selected: Set<string>;
  onChange: (values: string[]) => void;
  onCommit: () => void;
}

function indicesFromSelection(sorted: string[], selected: Set<string>, count: number) {
  const hits = sorted.map((opt, i) => (selected.has(opt) ? i : -1)).filter((i) => i >= 0);
  if (!hits.length) return { min: 0, max: Math.max(0, count - 1), active: false };
  return { min: Math.min(...hits), max: Math.max(...hits), active: true };
}

export function CategoryRangeSlider({
  options,
  selected,
  onChange,
  onCommit,
}: CategoryRangeSliderProps) {
  const sorted = useMemo(() => sortCategoryOptions(options), [options]);
  const count = sorted.length;
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'min' | 'max' | null>(null);

  const derived = useMemo(
    () => indicesFromSelection(sorted, selected, count),
    [count, selected, sorted],
  );

  const [minIdx, setMinIdx] = useState(derived.min);
  const [maxIdx, setMaxIdx] = useState(derived.max);

  useEffect(() => {
    setMinIdx(derived.min);
    setMaxIdx(derived.max);
  }, [derived.min, derived.max]);

  const applyRange = useCallback(
    (min: number, max: number, commit: boolean) => {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      setMinIdx(lo);
      setMaxIdx(hi);
      onChange(sorted.slice(lo, hi + 1));
      if (commit) onCommit();
    },
    [onChange, onCommit, sorted],
  );

  const indexAtPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track || count <= 1) return 0;
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return Math.round(ratio * (count - 1));
    },
    [count],
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const thumb = dragRef.current;
      if (!thumb) return;
      const idx = indexAtPointer(e.clientX);
      if (thumb === 'min') applyRange(idx, maxIdx, false);
      else applyRange(minIdx, idx, false);
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      onCommit();
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [applyRange, indexAtPointer, maxIdx, minIdx, onCommit]);

  if (count < 2) return null;

  const lo = Math.min(minIdx, maxIdx);
  const hi = Math.max(minIdx, maxIdx);
  const leftPct = count > 1 ? (lo / (count - 1)) * 100 : 0;
  const widthPct = count > 1 ? ((hi - lo) / (count - 1)) * 100 : 100;
  const minPct = count > 1 ? (minIdx / (count - 1)) * 100 : 0;
  const maxPct = count > 1 ? (maxIdx / (count - 1)) * 100 : 100;
  const span = hi - lo + 1;

  return (
    <div className="mdb-category-range">
      <div className="mdb-category-range__summary">
        <span className="mdb-category-range__pill" title={sorted[lo]}>
          {sorted[lo]}
        </span>
        <span className="mdb-category-range__arrow" aria-hidden>
          →
        </span>
        <span className="mdb-category-range__pill" title={sorted[hi]}>
          {sorted[hi]}
        </span>
        <span className="mdb-category-range__badge">
          {derived.active ? `${span}/${count}` : `${count} opts`}
        </span>
      </div>

      <div
        ref={trackRef}
        className="mdb-category-range__track"
        onPointerDown={(e) => {
          const idx = indexAtPointer(e.clientX);
          const distMin = Math.abs(idx - minIdx);
          const distMax = Math.abs(idx - maxIdx);
          dragRef.current = distMin <= distMax ? 'min' : 'max';
          applyRange(
            dragRef.current === 'min' ? idx : minIdx,
            dragRef.current === 'max' ? idx : maxIdx,
            false,
          );
          trackRef.current?.setPointerCapture(e.pointerId);
        }}
      >
        <div className="mdb-category-range__rail" />
        <div
          className="mdb-category-range__fill"
          style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
        />
        <button
          type="button"
          className="mdb-category-range__thumb"
          style={{ left: `calc(${minPct}% - 7px)` }}
          aria-label="Range start"
          onPointerDown={(e) => {
            e.stopPropagation();
            dragRef.current = 'min';
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
          }}
        />
        <button
          type="button"
          className="mdb-category-range__thumb"
          style={{ left: `calc(${maxPct}% - 7px)` }}
          aria-label="Range end"
          onPointerDown={(e) => {
            e.stopPropagation();
            dragRef.current = 'max';
            (e.currentTarget as HTMLButtonElement).setPointerCapture(e.pointerId);
          }}
        />
      </div>

      <div className="mdb-category-range__ticks" aria-hidden>
        {sorted.map((opt, i) => (
          <span
            key={opt}
            className={`mdb-category-range__tick${i >= lo && i <= hi ? ' is-active' : ''}`}
            title={opt}
          />
        ))}
      </div>
    </div>
  );
}
