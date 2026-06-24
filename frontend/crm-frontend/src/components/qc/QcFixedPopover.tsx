'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useFixedPopoverPosition } from '@/hooks/useFixedPopoverPosition';

/** Renders a fixed popover in document.body so overflow/transform parents cannot misplace it. */
export function QcFixedPopover({
  open,
  x,
  y,
  onClose,
  className,
  children,
}: {
  open: boolean;
  x: number;
  y: number;
  onClose: () => void;
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const anchor = open ? { x, y } : null;
  const pos = useFixedPopoverPosition(open, anchor, ref);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[85]" aria-hidden onClick={onClose} />
      <div
        ref={ref}
        className={className}
        style={{
          position: 'fixed',
          zIndex: 90,
          visibility: pos ? 'visible' : 'hidden',
          left: pos?.left ?? x,
          top: pos?.top ?? y,
        }}
        role="menu"
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
