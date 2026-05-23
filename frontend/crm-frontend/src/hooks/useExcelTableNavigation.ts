'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface CellPosition {
  row: number;
  col: number;
}

interface Options {
  rowCount: number;
  colCount: number;
  enabled?: boolean;
  isEditing?: boolean;
  onEnter?: (pos: CellPosition, seed?: string) => void;
}

export function useExcelTableNavigation({
  rowCount,
  colCount,
  enabled = true,
  isEditing = false,
  onEnter,
}: Options) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = useState<CellPosition>({ row: 0, col: 0 });

  const clamp = useCallback(
    (pos: CellPosition): CellPosition => ({
      row: Math.max(0, Math.min(rowCount - 1, pos.row)),
      col: Math.max(0, Math.min(colCount - 1, pos.col)),
    }),
    [rowCount, colCount],
  );

  const move = useCallback(
    (deltaRow: number, deltaCol: number) => {
      setActiveCell((prev) => clamp({ row: prev.row + deltaRow, col: prev.col + deltaCol }));
    },
    [clamp],
  );

  const scrollCellIntoView = useCallback((root: HTMLElement, el: HTMLElement) => {
    const stickyLeft = 44;
    const pad = 12;
    const cellRect = el.getBoundingClientRect();
    const parentRect = root.getBoundingClientRect();

    let nextLeft = root.scrollLeft;
    let nextTop = root.scrollTop;

    if (cellRect.right > parentRect.right - pad) {
      nextLeft += cellRect.right - parentRect.right + pad;
    } else if (cellRect.left < parentRect.left + stickyLeft + pad) {
      nextLeft -= parentRect.left + stickyLeft + pad - cellRect.left;
    }

    if (cellRect.bottom > parentRect.bottom - pad) {
      nextTop += cellRect.bottom - parentRect.bottom + pad;
    } else if (cellRect.top < parentRect.top + pad) {
      nextTop -= parentRect.top + pad - cellRect.top;
    }

    nextLeft = Math.max(0, nextLeft);
    nextTop = Math.max(0, nextTop);

    if (nextLeft === root.scrollLeft && nextTop === root.scrollTop) return;

    root.scrollTo({ left: nextLeft, top: nextTop, behavior: 'smooth' });
  }, []);

  const focusCell = useCallback(
    (pos: CellPosition) => {
      const { row, col } = clamp(pos);
      const root = containerRef.current;
      if (!root) return;

      const el = root.querySelector<HTMLElement>(
        `tbody td[data-grid-row="${row}"][data-grid-col="${col}"]`,
      );
      if (!el) return;

      el.focus({ preventScroll: true });
      scrollCellIntoView(root, el);
    },
    [clamp, scrollCellIntoView],
  );

  useEffect(() => {
    if (!enabled || rowCount === 0) return;
    setActiveCell((prev) => clamp(prev));
  }, [rowCount, colCount, enabled, clamp]);

  // Only focus cell when NOT editing (don't steal focus from input)
  useEffect(() => {
    if (!enabled || rowCount === 0 || isEditing) return;
    focusCell(activeCell);
  }, [activeCell, enabled, rowCount, isEditing, focusCell]);

  useEffect(() => {
    if (!enabled || rowCount === 0) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable;

      if (isEditing && inInput) return;

      const root = containerRef.current;
      const inTable = root?.contains(document.activeElement) ?? false;
      const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];

      if (!inTable && arrowKeys.includes(e.key)) {
        focusCell(activeCell);
      }
      if (
        !inTable &&
        !arrowKeys.includes(e.key) &&
        e.key !== 'Tab' &&
        e.key !== 'Enter' &&
        e.key !== 'F2'
      ) {
        return;
      }
      if (!inTable && e.key === 'Tab') {
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          move(-1, 0);
          break;
        case 'ArrowDown':
          e.preventDefault();
          move(1, 0);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          move(0, -1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          move(0, 1);
          break;
        case 'Tab': {
          e.preventDefault();
          setActiveCell((prev) => {
            let col = prev.col + (e.shiftKey ? -1 : 1);
            let row = prev.row;
            if (col >= colCount) {
              col = 0;
              row += 1;
            } else if (col < 0) {
              col = colCount - 1;
              row -= 1;
            }
            return clamp({ row, col });
          });
          break;
        }
        case 'Home':
          e.preventDefault();
          setActiveCell((prev) => ({ row: prev.row, col: 0 }));
          break;
        case 'End':
          e.preventDefault();
          setActiveCell((prev) => ({ row: prev.row, col: colCount - 1 }));
          break;
        case 'Enter':
        case 'F2':
          if (inTable || root?.contains(target)) {
            e.preventDefault();
            onEnter?.(activeCell);
          }
          break;
        default:
          if (
            inTable &&
            onEnter &&
            e.key.length === 1 &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.altKey
          ) {
            e.preventDefault();
            onEnter(activeCell, e.key);
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled, isEditing, rowCount, move, colCount, activeCell, onEnter, focusCell, clamp]);

  const setCell = useCallback(
    (pos: CellPosition) => setActiveCell(clamp(pos)),
    [clamp],
  );

  const isActive = useCallback(
    (row: number, col: number) => activeCell.row === row && activeCell.col === col,
    [activeCell],
  );

  return {
    containerRef,
    activeCell,
    setCell,
    isActive,
    focusCell,
  };
}
