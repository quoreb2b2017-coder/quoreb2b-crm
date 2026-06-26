'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type XlSelectOption = { value: string; label: string };

type MenuStyle = {
  left: number;
  width: number;
  maxHeight: number;
  placement: 'bottom' | 'top';
  top?: number;
  bottom?: number;
};

const MENU_GAP = 6;
const VIEWPORT_PAD = 8;
const DEFAULT_MENU_MAX = 260;

export function XlToolbarSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className,
  tone = 'toolbar',
  menuMinWidth = 180,
}: {
  value: string;
  onChange: (value: string) => void;
  options: XlSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  tone?: 'toolbar' | 'light';
  menuMinWidth?: number;
}) {
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const width = Math.max(rect.width, menuMinWidth);
    const left = Math.max(
      VIEWPORT_PAD,
      Math.min(rect.left, window.innerWidth - width - VIEWPORT_PAD),
    );

    const spaceBelow = window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PAD;
    const spaceAbove = rect.top - MENU_GAP - VIEWPORT_PAD;
    const openUp = spaceBelow < 160 && spaceAbove > spaceBelow;

    if (openUp) {
      setMenuStyle({
        placement: 'top',
        bottom: window.innerHeight - rect.top + MENU_GAP,
        left,
        width,
        maxHeight: Math.min(DEFAULT_MENU_MAX, Math.max(100, spaceAbove)),
      });
      return;
    }

    setMenuStyle({
      placement: 'bottom',
      top: rect.bottom + MENU_GAP,
      left,
      width,
      maxHeight: Math.min(DEFAULT_MENU_MAX, Math.max(100, spaceBelow)),
    });
  }, [menuMinWidth]);

  const refineMenuPosition = useCallback(() => {
    const btn = buttonRef.current;
    const menu = menuRef.current;
    if (!btn || !menu) return;
    const rect = btn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const width = Math.max(rect.width, menuMinWidth);
    const left = Math.max(
      VIEWPORT_PAD,
      Math.min(rect.left, window.innerWidth - width - VIEWPORT_PAD),
    );

    const overflowBottom = menuRect.bottom - (window.innerHeight - VIEWPORT_PAD);
    const overflowTop = VIEWPORT_PAD - menuRect.top;

    if (overflowBottom > 0 && rect.top > window.innerHeight / 2) {
      setMenuStyle({
        placement: 'top',
        bottom: window.innerHeight - rect.top + MENU_GAP,
        left,
        width,
        maxHeight: Math.min(
          DEFAULT_MENU_MAX,
          Math.max(100, rect.top - MENU_GAP - VIEWPORT_PAD),
        ),
      });
      return;
    }

    if (overflowTop > 0) {
      setMenuStyle({
        placement: 'bottom',
        top: rect.bottom + MENU_GAP,
        left,
        width,
        maxHeight: Math.min(
          DEFAULT_MENU_MAX,
          Math.max(100, window.innerHeight - rect.bottom - MENU_GAP - VIEWPORT_PAD),
        ),
      });
    }
  }, [menuMinWidth]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onReposition = () => updateMenuPosition();

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);

    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => refineMenuPosition());
    return () => cancelAnimationFrame(id);
  }, [open, refineMenuPosition]);

  const menu =
    open && menuStyle && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: menuStyle.placement === 'bottom' ? menuStyle.top : undefined,
              bottom: menuStyle.placement === 'top' ? menuStyle.bottom : undefined,
              left: menuStyle.left,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight,
              zIndex: 99999,
            }}
            className={cn(
              'overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl',
              'pointer-events-auto opacity-100',
              'transition-[opacity,transform] duration-200 ease-out',
              menuStyle.placement === 'top' ? 'origin-bottom' : 'origin-top',
            )}
          >
            <ul
              className="overflow-y-auto overscroll-contain py-1 scrollbar-thin"
              style={{ maxHeight: menuStyle.maxHeight }}
            >
              {options.length === 0 ? (
                <li className="px-3 py-2 text-xs text-slate-400">No options</li>
              ) : (
                options.map((opt) => {
                  const active = opt.value === value;
                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onChange(opt.value);
                          setOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-150',
                          active
                            ? 'bg-[#2e7ad1] font-medium text-white'
                            : 'text-slate-700 hover:bg-[#e8f5ee] hover:text-[#2568b8]',
                        )}
                      >
                        <span className="min-w-0 flex-1 truncate" title={opt.label}>
                          {opt.label}
                        </span>
                        {active ? <Check className="h-3.5 w-3.5 shrink-0 opacity-90" /> : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>,
          document.body,
        )
      : null;

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          if (!open) updateMenuPosition();
          setOpen((o) => !o);
        }}
        className={cn(
          'flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-sm transition-all duration-200 ease-out',
          tone === 'toolbar'
            ? cn(
                'border border-white/25 bg-white text-slate-800 shadow-sm',
                'hover:border-white/50 hover:shadow-md',
                'focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-[#2e7ad1]',
                open &&
                  'border-white/60 shadow-md ring-2 ring-white/30 ring-offset-1 ring-offset-[#2e7ad1]',
              )
            : cn(
                'rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm',
                'hover:border-slate-300 hover:shadow-md',
                'focus:outline-none focus:ring-2 focus:ring-[#2e7ad1]/25 focus:ring-offset-1',
                open && 'border-[#2e7ad1]/40 shadow-md ring-2 ring-[#2e7ad1]/15',
              ),
          disabled && 'cursor-not-allowed opacity-55',
        )}
      >
        <span className="min-w-0 flex-1 truncate font-medium">
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ease-out',
            open && 'rotate-180 text-[#2e7ad1]',
          )}
        />
      </button>
      {menu}
    </div>
  );
}
