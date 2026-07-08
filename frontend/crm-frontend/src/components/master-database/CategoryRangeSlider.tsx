'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sortCategoryOptions } from './master-database-columns';
import { XlToolbarMultiSelect } from '@/components/admin/XlToolbarMultiSelect';

interface CategoryRangeSliderProps {
  options: string[];
  selected: Set<string>;
  onChange: (values: string[]) => void;
  onCommit: () => void;
}

type FilterMode = 'manual' | 'range' | 'multi';

function indicesFromSelection(sorted: string[], selected: Set<string>, count: number) {
  const hits = sorted.map((opt, i) => (selected.has(opt) ? i : -1)).filter((i) => i >= 0);
  if (!hits.length) return { min: 0, max: Math.max(0, count - 1), active: false };
  return { min: Math.min(...hits), max: Math.max(...hits), active: true };
}

function parseNumericHint(raw: string): number | null {
  const s = raw.trim().replace(/,/g, '');
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

function optionNumericBounds(opt: string): { lo: number; hi: number } | null {
  const range = opt.match(/(\d[\d,]*(?:\.\d+)?)\s*[-–—to]+\s*(\d[\d,]*(?:\.\d+)?)/i);
  if (range) {
    return {
      lo: Number(range[1].replace(/,/g, '')),
      hi: Number(range[2].replace(/,/g, '')),
    };
  }
  if (/less than/i.test(opt)) {
    const n = opt.match(/(\d[\d,]*(?:\.\d+)?)/);
    if (n) return { lo: 0, hi: Number(n[1].replace(/,/g, '')) - 1 };
  }
  if (/above|\+/i.test(opt)) {
    const n = opt.match(/(\d[\d,]*(?:\.\d+)?)/);
    if (n) return { lo: Number(n[1].replace(/,/g, '')), hi: Number.POSITIVE_INFINITY };
  }
  const leading = opt.match(/^(\d[\d,]*(?:\.\d+)?)/);
  if (leading) {
    const n = Number(leading[1].replace(/,/g, ''));
    return { lo: n, hi: n };
  }
  return null;
}

function matchOption(sorted: string[], raw: string): string | null {
  const q = raw.trim();
  if (!q) return null;

  const exact = sorted.find((o) => o === q);
  if (exact) return exact;

  const lower = q.toLowerCase();
  const ci = sorted.find((o) => o.toLowerCase() === lower);
  if (ci) return ci;

  const hint = parseNumericHint(q);
  if (hint != null) {
    for (const opt of sorted) {
      const bounds = optionNumericBounds(opt);
      if (!bounds) continue;
      if (hint >= bounds.lo && hint <= bounds.hi) return opt;
    }
  }

  const partial = sorted.find((o) => o.toLowerCase().includes(lower));
  return partial ?? null;
}

/**
 * Employee / Revenue size — three ways to filter (manual takes priority when typing):
 * 1. Manual From → To text inputs
 * 2. Drag range on the track
 * 3. Multi-select dropdown
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

  const [filterMode, setFilterMode] = useState<FilterMode>('multi');
  const [manualDirty, setManualDirty] = useState(false);
  const [minIdx, setMinIdx] = useState(derived.min);
  const [maxIdx, setMaxIdx] = useState(derived.max);
  const [fromText, setFromText] = useState('');
  const [toText, setToText] = useState('');
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<'min' | 'max' | null>(null);

  useEffect(() => {
    if (manualDirty) return;
    setMinIdx(derived.min);
    setMaxIdx(derived.max);
    if (derived.active && filterMode !== 'manual') {
      setFromText(sorted[derived.min] ?? '');
      setToText(sorted[derived.max] ?? '');
    } else if (!derived.active && filterMode !== 'manual') {
      setFromText('');
      setToText('');
    }
  }, [derived.min, derived.max, derived.active, filterMode, manualDirty, sorted]);

  const applyRange = useCallback(
    (min: number, max: number, mode: FilterMode, commit: boolean) => {
      const lo = Math.min(min, max);
      const hi = Math.max(min, max);
      setFilterMode(mode);
      setManualDirty(false);
      setMinIdx(lo);
      setMaxIdx(hi);
      if (mode === 'manual') {
        setFromText(sorted[lo] ?? '');
        setToText(sorted[hi] ?? '');
      }
      onChange(sorted.slice(lo, hi + 1));
      if (commit) onCommit();
    },
    [onChange, onCommit, sorted],
  );

  const applyManualRange = useCallback(() => {
    const fromRaw = fromText.trim();
    const toRaw = toText.trim();

    if (!fromRaw && !toRaw) {
      setFilterMode('manual');
      setManualDirty(false);
      onChange([]);
      onCommit();
      return;
    }

    const fromOpt = fromRaw ? matchOption(sorted, fromRaw) : null;
    const toOpt = toRaw ? matchOption(sorted, toRaw) : null;

    if (!fromOpt && !toOpt) {
      setFilterMode('manual');
      setManualDirty(true);
      onChange([]);
      return;
    }

    const fromIdx = fromOpt ? sorted.indexOf(fromOpt) : toOpt ? sorted.indexOf(toOpt) : 0;
    const toIdx = toOpt ? sorted.indexOf(toOpt) : fromOpt ? sorted.indexOf(fromOpt) : 0;
    applyRange(fromIdx, toIdx, 'manual', true);
  }, [applyRange, fromText, onChange, onCommit, sorted, toText]);

  const onManualFromChange = (value: string) => {
    setFilterMode('manual');
    setManualDirty(true);
    setFromText(value);
    onChange([]);
  };

  const onManualToChange = (value: string) => {
    setFilterMode('manual');
    setManualDirty(true);
    setToText(value);
    onChange([]);
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
      if (thumb === 'min') applyRange(idx, maxIdx, 'range', false);
      else applyRange(minIdx, idx, 'range', false);
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
  const multiValues =
    filterMode === 'manual' && manualDirty ? new Set<string>() : selected;

  return (
    <div className="mdb-category-range">
      <div className="mdb-category-range__head">
        <span className="mdb-category-range__pill" title={derived.active ? sorted[lo] : ''}>
          {filterMode === 'manual' && manualDirty
            ? fromText.trim() || 'From…'
            : derived.active
              ? sorted[lo]
              : 'From…'}
        </span>
        <span className="mdb-category-range__arrow" aria-hidden>
          →
        </span>
        <span className="mdb-category-range__pill" title={derived.active ? sorted[hi] : ''}>
          {filterMode === 'manual' && manualDirty
            ? toText.trim() || 'To…'
            : derived.active
              ? sorted[hi]
              : 'To…'}
        </span>
        <span className="mdb-category-range__badge">
          {derived.active && filterMode !== 'manual'
            ? `${span}/${count}`
            : filterMode === 'manual' && derived.active
              ? 'Manual'
              : `${count} opts`}
        </span>
      </div>

      <div className="mdb-category-range__section">
        <span className="mdb-category-range__section-label">Manual range</span>
        <div className="mdb-category-range__manual">
          <input
            type="text"
            className="mdb-category-range__text"
            value={fromText}
            placeholder="From — e.g. 1 to 10"
            onChange={(e) => onManualFromChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyManualRange()}
          />
          <span className="mdb-category-range__arrow" aria-hidden>
            →
          </span>
          <input
            type="text"
            className="mdb-category-range__text"
            value={toText}
            placeholder="To — e.g. 5001 and above"
            onChange={(e) => onManualToChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && applyManualRange()}
          />
          <button
            type="button"
            className="mdb-category-range__apply"
            onClick={applyManualRange}
          >
            Apply
          </button>
        </div>
      </div>

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
                'range',
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

      <div className="mdb-category-range__section">
        <span className="mdb-category-range__section-label">Dropdown pick</span>
        <XlToolbarMultiSelect
          tone="light"
          className="mdb-category-range__multiselect"
          menuMinWidth={300}
          values={multiValues}
          placeholder="Select one or more sizes…"
          onChange={(next) => {
            setFilterMode('multi');
            setManualDirty(false);
            setFromText('');
            setToText('');
            onChange([...next]);
          }}
          onApply={(next) => {
            if (next.size > 0) onCommit();
          }}
          options={selectOptions}
        />
      </div>
    </div>
  );
}
