'use client';

import { useLayoutEffect, useState, type RefObject } from 'react';

const MARGIN = 12;
const OFFSET_Y = 6;

/** Clamp a fixed popover to the viewport after measuring its size. */
export function useFixedPopoverPosition(
  open: boolean,
  anchor: { x: number; y: number } | null,
  ref: RefObject<HTMLElement | null>,
) {
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPos(null);
      return;
    }

    const place = () => {
      const el = ref.current;
      if (!el) return;

      const { width, height } = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      let left = anchor.x;
      let top = anchor.y + OFFSET_Y;

      if (left + width > vw - MARGIN) {
        left = vw - width - MARGIN;
      }
      if (left < MARGIN) left = MARGIN;

      if (top + height > vh - MARGIN) {
        top = anchor.y - height - OFFSET_Y;
      }
      if (top < MARGIN) top = MARGIN;

      setPos({ left, top });
    };

    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, anchor?.x, anchor?.y, ref]);

  return pos;
}
