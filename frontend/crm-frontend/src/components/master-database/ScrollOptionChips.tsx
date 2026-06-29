'use client';

import { useRef } from 'react';
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
  useDragToScroll(trackRef, true);

  if (!options.length) return null;

  const active = selected.size > 0;

  return (
    <div className="mdb-scroll-chips">
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
      {multiple && active && (
        <p className="mdb-scroll-chips__meta">{selected.size} selected — tap to add/remove</p>
      )}
    </div>
  );
}
