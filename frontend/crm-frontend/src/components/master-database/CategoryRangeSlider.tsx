'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortCategoryOptions } from './master-database-columns';
import { XlToolbarSelect } from '@/components/admin/XlToolbarSelect';
import { XlToolbarMultiSelect } from '@/components/admin/XlToolbarMultiSelect';

interface CategoryRangeSliderProps {
  options: string[];
  selected: Set<string>;
  onChange: (values: string[]) => void;
  onCommit: () => void;
  listId?: string;
}

function indicesFromSelection(sorted: string[], selected: Set<string>, count: number) {
  const hits = sorted.map((opt, i) => (selected.has(opt) ? i : -1)).filter((i) => i >= 0);
  if (!hits.length) return { min: 0, max: Math.max(0, count - 1), active: false };
  return { min: Math.min(...hits), max: Math.max(...hits), active: true };
}

function matchOption(sorted: string[], raw: string): string | null {
  const q = raw.trim();
  if (!q) return null;
  const exact = sorted.find((o) => o === q);
  if (exact) return exact;
  const lower = q.toLowerCase();
  const ci = sorted.find((o) => o.toLowerCase() === lower);
  if (ci) return ci;
  const partial = sorted.find((o) => o.toLowerCase().includes(lower));
  return partial ?? null;
}

/**
 * Employee / Revenue size — three ways to filter (all stay in sync):
 * 1. Manual From → To inputs (full labels like "1 to 10")
 * 2. Drag range on the track
 * 3. Multi-select dropdown
 */
export function CategoryRangeSlider({
  options,
  selected,
  onChange,
  onCommit,
  listId = 'mdb-size-options',
}: CategoryRangeSliderProps) {
  const sorted = useMemo(() => sortCategoryOptions(options), [options]);
  const count = sorted.length;
  const datalistId = `${listId}-${sorted[0]?.slice(0, 8) ?? 'x'}`;

  const derived = useMemo(
    () => indicesFromSelection(sorted, selected, count),
    [count, selected, sorted],
  );

  const [minIdx, setMinIdx] = useState(derived.min);
  const [maxIdx, setMaxIdx] = useState(derived.max);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'min' | 'max' | null>(null);

  useEffect(() => {
    setMinIdx(derived.min);
    setMaxIdx(derived.max);
    if (derived.active) {
      setFromText(sorted[derived.min] ?? '');
      setToText(sorted[derived.max] ?? '');
    } else {
      setFromText('');
      setToText('');
    }
  }, [derived.min, derived.max, derived.active, sorted]);

  const applyRange = useCallback(
    (min: number, max: number, commit: boolean) => {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      setMinIdx(lo);
      setMaxIdx(hi);
      setFromText(sorted[lo] ?? '');
      setToText(sorted[hi] ?? '');
      onChange(sorted.slice(lo, hi + 1));
      if (commit) onCommit();
    },
    [onChange, onCommit, sorted],
  );

  const applyManualRange = () => {
    const fromOpt = matchOption(sorted, fromText);
    const toOpt = matchOption(sorted, toText);
    if (!fromOpt && !toOpt) {
      if (!fromText.trim() && !toText.trim()) {
        onChange([]);
        onCommit();
      }
      return;
    }
    const fromIdx = fromOpt ? sorted.indexOf(fromOpt) : toOpt ? sorted.indexOf(toOpt) : 0;
    const toIdx = toOpt ? sorted.indexOf(toOpt) : fromOpt ? sorted.indexOf(fromOpt) : 0;
    applyRange(fromIdx, toIdx, true);
  };

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

  if (count < 1) return null;

  const lo = Math.min(minIdx, maxIdx);
  const hi = Math.max(minIdx, maxIdx);
  const leftPct = count > 1 ? (lo / (count - 1)) * 100 : 0;
  const widthPct = count > 1 ? ((hi - lo) / (count - 1)) * 100 : 100;
  const minPct = count > 1 ? (minIdx / (count - 1)) * 100 : 0;
  const maxPct = count > 1 ? (maxIdx / (count - 1)) * 100 : 100;
  const span = derived.active ? hi - lo + 1 : 0;
  const selectOptions = sorted.map((opt) => ({ value: opt, label: opt }));

  const applyFromSelect = (label: string) => {
    if (!label) {
      onChange([]);
      onCommit();
      return;
    }
    const fromIdx = sorted.indexOf(label);
    if (fromIdx < 0) return;
    const toIdx = derived.active ? Math.max(fromIdx, hi) : fromIdx;
    applyRange(fromIdx, toIdx, true);
  };

  const applyToSelect = (label: string) => {
    if (!label) {
      onChange([]);
      onCommit();
      return;
    }
    const toIdx = sorted.indexOf(label);
    if (toIdx < 0) return;
    const fromIdx = derived.active ? Math.min(lo, toIdx) : toIdx;
    applyRange(fromIdx, toIdx, true);
  };

  return (
    <div className="mdb-category-range">
      <div className="mdb-category-range__head">
        <span className="mdb-category-range__pill" title={derived.active ? sorted[lo] : ''}>
          {derived.active ? sorted[lo] : 'From…'}
        </span>
        <span className="mdb-category-range__arrow" aria-hidden>
          →
        </span>
        <span className="mdb-category-range__pill" title={derived.active ? sorted[hi] : ''}>
          {derived.active ? sorted[hi] : 'To…'}
        </span>
        <span className="mdb-category-range__badge">
          {derived.active ? `${span}/${count}` : `${count} opts`}
        </span>
      </div>

      {/* 1 — Manual type / pick From → To */}
      <div className="mdb-category-range__section">
        <span className="mdb-category-range__section-label">Manual range</span>
        <div className="mdb-category-range__manual">
          <input
            type="text"
            className="mdb-category-range__text"
            list={datalistId}
            value={fromText}
            placeholder="From — e.g. 1 to 10"
            onChange={(e) => setFromText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyManualRange()}
            onBlur={applyManualRange}
          />
          <span className="mdb-category-range__arrow" aria-hidden>
            →
          </span>
          <input
            type="text"
            className="mdb-category-range__text"
            list={datalistId}
            value={toText}
            placeholder="To — e.g. 5001 and above"
            onChange={(e) => setToText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyManualRange()}
            onBlur={applyManualRange}
          />
        </div>
        <div className="mdb-category-range__pick">
          <XlToolbarSelect
            tone="light"
            className="mdb-category-range__select"
            menuMinWidth={240}
            value={derived.active ? sorted[lo] : ''}
            placeholder="Pick from…"
            onChange={applyFromSelect}
            options={selectOptions}
          />
          <XlToolbarSelect
            tone="light"
            className="mdb-category-range__select"
            menuMinWidth={240}
            value={derived.active ? sorted[hi] : ''}
            placeholder="Pick to…"
            onChange={applyToSelect}
            options={selectOptions}
          />
        </div>
        <datalist id={datalistId}>
          {sorted.map((opt) => (
            <option key={opt} value={opt} />
          ))}
        </datalist>
      </div>

      {/* 2 — Drag range */}
      {count >= 2 && (
        <div className="mdb-category-range__section">
          <span className="mdb-category-range__section-label">Drag range</span>
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
      )}

      {/* 3 — Dropdown multi-select */}
      <div className="mdb-category-range__section">
        <span className="mdb-category-range__section-label">Dropdown pick</span>
        <XlToolbarMultiSelect
          tone="light"
          className="mdb-category-range__multiselect"
          menuMinWidth={300}
          values={selected}
          placeholder="Select one or more sizes…"
          onChange={(next) => {
            onChange([...next]);
          }}
          onApply={onCommit}
          options={selectOptions}
        />
      </div>
    </div>
  );
}
