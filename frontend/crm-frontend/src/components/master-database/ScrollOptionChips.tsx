'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useDragToScroll } from '@/hooks/useDragToScroll';

interface ScrollOptionChipsProps {
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
  /** When true, chips add/remove without clearing other selections */
  multiple?: boolean;
}

export function ScrollOptionChips({
  options,
  selected,
  onToggle,
  onClear,
  multiple = false,
}: ScrollOptionChipsProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  useDragToScroll(trackRef, true);

  const updateScrollState = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState, { passive: true });
    const ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', updateScrollState);
      ro.disconnect();
    };
  }, [options.length, updateScrollState]);

  const scrollBy = (delta: number) => {
    trackRef.current?.scrollBy({ left: delta, behavior: 'smooth' });
  };

  if (!options.length) return null;

  const active = selected.size > 0;

  return (
    <div className="mdb-scroll-chips">
      <button
        type="button"
        className="mdb-scroll-chips__arrow mdb-scroll-chips__arrow--left"
        aria-label="Scroll options left"
        disabled={!canScrollLeft}
        onClick={() => scrollBy(-160)}
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <div ref={trackRef} className="mdb-scroll-chips__track xl-drag-scroll">
        <button
          type="button"
          className={`mdb-scroll-chips__chip${!active ? ' is-active' : ''}`}
          onClick={onClear}
        >
          All
        </button>
        {options.map((opt) => {
          const label = opt.length > 28 ? `${opt.slice(0, 26)}…` : opt;
          const isOn = selected.has(opt);
          return (
            <button
              key={opt}
              type="button"
              className={`mdb-scroll-chips__chip${isOn ? ' is-active' : ''}${multiple && isOn ? ' is-multi' : ''}`}
              title={opt}
              onClick={() => onToggle(opt)}
            >
              {label}
              {multiple && isOn ? <span className="mdb-scroll-chips__check">✓</span> : null}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        className="mdb-scroll-chips__arrow mdb-scroll-chips__arrow--right"
        aria-label="Scroll options right"
        disabled={!canScrollRight}
        onClick={() => scrollBy(160)}
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {multiple && active && (
        <p className="mdb-scroll-chips__meta">{selected.size} selected — tap to add/remove</p>
      )}
    </div>
  );
}
