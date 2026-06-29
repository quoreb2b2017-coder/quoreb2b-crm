'use client';

import { useEffect, type RefObject } from 'react';

/** Click-drag panning on a scrollable element (Excel-style grab scroll). */
export function useDragToScroll(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let active = false;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const isInteractive = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest(
          'input, button, a, label, textarea, select, [contenteditable="true"], [data-no-drag-scroll]',
        ),
      );
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || isInteractive(e.target)) return;
      active = true;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = el.scrollLeft;
      scrollTop = el.scrollTop;
      el.setPointerCapture(e.pointerId);
      el.classList.add('xl-drag-scrolling');
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!active) return;
      e.preventDefault();
      el.scrollLeft = scrollLeft - (e.clientX - startX);
      el.scrollTop = scrollTop - (e.clientY - startY);
    };

    const end = (e: PointerEvent) => {
      if (!active) return;
      active = false;
      el.classList.remove('xl-drag-scrolling');
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
      el.classList.remove('xl-drag-scrolling');
    };
  }, [ref, enabled]);
}
