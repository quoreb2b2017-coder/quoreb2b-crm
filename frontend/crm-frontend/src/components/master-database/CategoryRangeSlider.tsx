'use client';

import { useMemo } from 'react';
import { sortCategoryOptions } from './master-database-columns';
import { XlToolbarSelect } from '@/components/admin/XlToolbarSelect';

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

/**
 * Two select boxes for a category range (e.g. Employee / Revenue size).
 * Each option keeps the full label ("1 to 10") — never split into parts.
 */
export function CategoryRangeSlider({
  options,
  selected,
  onChange,
  onCommit,
}: CategoryRangeSliderProps) {
  const sorted = useMemo(() => sortCategoryOptions(options), [options]);
  const count = sorted.length;
  const derived = useMemo(
    () => indicesFromSelection(sorted, selected, count),
    [count, selected, sorted],
  );

  if (count < 1) return null;

  const lo = derived.active ? derived.min : -1;
  const hi = derived.active ? derived.max : -1;
  const fromValue = lo >= 0 ? sorted[lo] : '';
  const toValue = hi >= 0 ? sorted[hi] : '';
  const span = derived.active ? hi - lo + 1 : 0;

  const selectOptions = sorted.map((opt) => ({ value: opt, label: opt }));

  const applyFrom = (label: string) => {
    if (!label) {
      onChange([]);
      onCommit();
      return;
    }
    const fromIdx = sorted.indexOf(label);
    if (fromIdx < 0) return;
    const toIdx = hi >= 0 ? Math.max(fromIdx, hi) : fromIdx;
    onChange(sorted.slice(fromIdx, toIdx + 1));
    onCommit();
  };

  const applyTo = (label: string) => {
    if (!label) {
      onChange([]);
      onCommit();
      return;
    }
    const toIdx = sorted.indexOf(label);
    if (toIdx < 0) return;
    const fromIdx = lo >= 0 ? Math.min(lo, toIdx) : toIdx;
    onChange(sorted.slice(fromIdx, toIdx + 1));
    onCommit();
  };

  return (
    <div className="mdb-category-range">
      <div className="mdb-category-range__summary">
        <div className="mdb-category-range__box">
          <XlToolbarSelect
            tone="light"
            className="mdb-category-range__select"
            menuMinWidth={220}
            value={fromValue}
            placeholder="From…"
            onChange={applyFrom}
            options={selectOptions}
          />
        </div>
        <span className="mdb-category-range__arrow" aria-hidden>
          →
        </span>
        <div className="mdb-category-range__box">
          <XlToolbarSelect
            tone="light"
            className="mdb-category-range__select"
            menuMinWidth={220}
            value={toValue}
            placeholder="To…"
            onChange={applyTo}
            options={selectOptions}
          />
        </div>
        <span className="mdb-category-range__badge">
          {derived.active ? `${span}/${count}` : `${count} opts`}
        </span>
      </div>
    </div>
  );
}
