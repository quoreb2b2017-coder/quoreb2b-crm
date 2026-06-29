'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { XlSelectOption } from './XlToolbarSelect';

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
const DEFAULT_MENU_MAX = 300;

export function XlToolbarMultiSelect({
  values,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className,
  tone = 'light',
  menuMinWidth = 260,
  onApply,
  searchable = true,
}: {
  values: Set<string>;
  onChange: (values: Set<string>) => void;
  options: XlSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  tone?: 'toolbar' | 'light';
  menuMinWidth?: number;
  onApply?: () => void;
  searchable?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayLabel = (() => {
    if (values.size === 0) return placeholder;
    if (values.size === 1) {
      const v = [...values][0];
      return options.find((o) => o.value === v)?.label ?? v;
    }
    return `${values.size} selected`;
  })();

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
    );
  }, [options, query]);

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
    const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;

    if (openUp) {
      setMenuStyle({
        placement: 'top',
        bottom: window.innerHeight - rect.top + MENU_GAP,
        left,
        width,
        maxHeight: Math.min(DEFAULT_MENU_MAX, Math.max(140, spaceAbove)),
      });
      return;
    }

    setMenuStyle({
      placement: 'bottom',
      top: rect.bottom + MENU_GAP,
      left,
      width,
      maxHeight: Math.min(DEFAULT_MENU_MAX, Math.max(140, spaceBelow)),
    });
  }, [menuMinWidth]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
    onApply?.();
  }, [onApply]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
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
  }, [open, updateMenuPosition, closeMenu]);

  const toggle = (value: string) => {
    const next = new Set(values);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const clearAll = () => onChange(new Set());

  const listMaxHeight = menuStyle ? menuStyle.maxHeight - (searchable && options.length > 5 ? 88 : 44) : 200;

  const menu =
    open && menuStyle && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            role="listbox"
            aria-multiselectable
            style={{
              position: 'fixed',
              top: menuStyle.placement === 'bottom' ? menuStyle.top : undefined,
              bottom: menuStyle.placement === 'top' ? menuStyle.bottom : undefined,
              left: menuStyle.left,
              width: menuStyle.width,
              maxHeight: menuStyle.maxHeight,
              zIndex: 99999,
            }}
            className="xl-multi-select-menu flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-2xl ring-1 ring-slate-900/5"
          >
            {searchable && options.length > 5 && (
              <div className="border-b border-slate-100 px-2 py-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search…"
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-2 text-xs outline-none focus:border-[#2e7ad1] focus:bg-white focus:ring-2 focus:ring-[#2e7ad1]/15"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
            <ul
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1 scrollbar-thin"
              style={{ maxHeight: listMaxHeight }}
            >
              {filteredOptions.length === 0 ? (
                <li className="px-3 py-3 text-center text-xs text-slate-400">No matches</li>
              ) : (
                filteredOptions.map((opt) => {
                  const active = values.has(opt.value);
                  return (
                    <li key={opt.value}>
                      <button
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => toggle(opt.value)}
                        className={cn(
                          'flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition-colors',
                          active
                            ? 'bg-[#e8f1fb] font-medium text-[#1d4ed8]'
                            : 'text-slate-700 hover:bg-slate-50',
                        )}
                      >
                        <span
                          className={cn(
                            'flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border',
                            active
                              ? 'border-[#2e7ad1] bg-[#2e7ad1] text-white'
                              : 'border-slate-300 bg-white',
                          )}
                        >
                          {active ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
                        </span>
                        <span className="min-w-0 flex-1 truncate" title={opt.label}>
                          {opt.label}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-100 bg-gradient-to-r from-slate-50 to-white px-2.5 py-2">
              <span className="text-[10px] font-medium text-slate-500">
                {values.size > 0 ? `${values.size} picked` : 'Pick multiple'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                  onClick={clearAll}
                >
                  Clear
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[#2e7ad1] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-[#2568b8]"
                  onClick={closeMenu}
                >
                  Done
                </button>
              </div>
            </div>
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
          'xl-multi-select-trigger flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-sm transition-all duration-200',
          tone === 'toolbar'
            ? 'border border-white/25 bg-white text-slate-800 shadow-sm hover:border-white/50 hover:shadow-md'
            : cn(
                'rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm',
                'hover:border-[#2e7ad1]/30 hover:shadow-md',
                values.size > 0 && 'border-[#2e7ad1]/35 bg-[#f8fbff]',
                open && 'border-[#2e7ad1]/50 shadow-md ring-2 ring-[#2e7ad1]/12',
              ),
          disabled && 'cursor-not-allowed opacity-55',
        )}
      >
        <span
          className={cn(
            'min-w-0 flex-1 truncate font-medium',
            values.size > 0 ? 'text-[#1e40af]' : 'text-slate-600',
          )}
        >
          {displayLabel}
        </span>
        {values.size > 1 && (
          <span className="shrink-0 rounded-full bg-[#2e7ad1] px-1.5 py-px text-[10px] font-bold text-white">
            {values.size}
          </span>
        )}
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200',
            open && 'rotate-180 text-[#2e7ad1]',
          )}
        />
      </button>
      {menu}
    </div>
  );
}
