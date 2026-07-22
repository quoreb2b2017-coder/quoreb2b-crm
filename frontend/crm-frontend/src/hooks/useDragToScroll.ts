'use client';

import { useEffect, type RefObject } from 'react';

const DRAG_THRESHOLD_PX = 6;

/** Click-drag panning on a scrollable element (Excel-style grab scroll). */
export function useDragToScroll(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !enabled) return;

    let tracking = false;
    let dragging = false;
    let pointerId: number | null = null;
    let startX = 0;
    let startY = 0;
    let scrollLeft = 0;
    let scrollTop = 0;

    const isInteractive = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return Boolean(
        target.closest(
          'input, button, a, label, textarea, select, [contenteditable="true"], [data-no-drag-scroll], [draggable="true"]',
        ),
      );
    };

    const end = (e: PointerEvent) => {
      if (!tracking && !dragging) return;
      tracking = false;
      dragging = false;
      pointerId = null;
      el.classList.remove('xl-drag-scrolling');
      try {
        if (el.hasPointerCapture(e.pointerId)) {
          el.releasePointerCapture(e.pointerId);
        }
      } catch {
        /* already released */
      }
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 || isInteractive(e.target)) return;
      tracking = true;
      dragging = false;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      scrollLeft = el.scrollLeft;
      scrollTop = el.scrollTop;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!tracking || pointerId !== e.pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX && Math.abs(dy) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        el.setPointerCapture(e.pointerId);
        el.classList.add('xl-drag-scrolling');
      }
      e.preventDefault();
      el.scrollLeft = scrollLeft - dx;
      el.scrollTop = scrollTop - dy;
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
