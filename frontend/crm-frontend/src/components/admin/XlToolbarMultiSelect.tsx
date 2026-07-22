'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check, Search, X } from 'lucide-react';
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
  displayMode = 'label',
  fetchOptionsOnSearch,
}: {
  values: Set<string>;
  onChange: (values: Set<string>) => void;
  options: XlSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  tone?: 'toolbar' | 'light';
  menuMinWidth?: number;
  onApply?: (values: Set<string>) => void;
  searchable?: boolean;
  displayMode?: 'label' | 'chips';
  fetchOptionsOnSearch?: (query: string) => Promise<XlSelectOption[]>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [menuStyle, setMenuStyle] = useState<MenuStyle | null>(null);
  const [remoteOptions, setRemoteOptions] = useState<XlSelectOption[]>([]);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const fetchSeqRef = useRef(0);

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
    const base = fetchOptionsOnSearch && q.length >= 1 ? remoteOptions : options;
    let list = !q
      ? base
      : base.filter(
          (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q),
        );
    for (const value of values) {
      if (list.some((o) => o.value === value)) continue;
      const known = options.find((o) => o.value === value);
      list = [...list, known ?? { value, label: value }];
    }
    return list;
  }, [fetchOptionsOnSearch, options, query, remoteOptions, values]);

  useEffect(() => {
    if (!fetchOptionsOnSearch) {
      setRemoteOptions([]);
      setRemoteLoading(false);
      return;
    }
    const q = query.trim();
    if (q.length < 1) {
      setRemoteOptions([]);
      setRemoteLoading(false);
      return;
    }

    const seq = ++fetchSeqRef.current;
    setRemoteLoading(true);
    const timer = window.setTimeout(() => {
      void fetchOptionsOnSearch(q)
        .then((next) => {
          if (fetchSeqRef.current !== seq) return;
          setRemoteOptions(next);
        })
        .catch(() => {
          if (fetchSeqRef.current !== seq) return;
          setRemoteOptions([]);
        })
        .finally(() => {
          if (fetchSeqRef.current !== seq) return;
          setRemoteLoading(false);
        });
    }, 200);

    return () => window.clearTimeout(timer);
  }, [fetchOptionsOnSearch, query]);

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
    setRemoteOptions([]);
    setRemoteLoading(false);
    onApply?.(values);
  }, [onApply, values]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    const onPointerDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      closeMenu();
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
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

  const removeValue = (value: string, e: MouseEvent) => {
    e.stopPropagation();
    const next = new Set(values);
    next.delete(value);
    onChange(next);
  };

  const chipLabel = (value: string) =>
    options.find((o) => o.value === value)?.label ?? value;

  const clearAll = () => onChange(new Set());

  const isChipBox = displayMode === 'chips';
  const showChips = isChipBox && values.size > 0;

  const listMaxHeight = menuStyle ? menuStyle.maxHeight - (searchable ? 88 : 44) : 200;

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
            {searchable && (
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
                <li className="px-3 py-3 text-center text-xs text-slate-400">
                  {remoteLoading ? 'Searching…' : 'No matches'}
                </li>
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
          'xl-multi-select-trigger flex w-full gap-1.5 text-left text-sm transition-all duration-200',
          isChipBox
            ? 'xl-multi-select-trigger--chips min-h-[2.125rem] flex-wrap items-center px-2 py-1.5'
            : 'items-center justify-between gap-2 px-2.5 py-2',
          tone === 'toolbar'
            ? 'border border-white/25 bg-white text-slate-800 shadow-sm hover:border-white/50 hover:shadow-md'
            : cn(
                isChipBox
                  ? 'rounded-[7px] border border-[#d8e3f0] bg-white text-slate-800'
                  : 'rounded-lg border border-slate-200 bg-white text-slate-800 shadow-sm',
                !isChipBox && 'hover:border-[#2e7ad1]/30 hover:shadow-md',
                isChipBox && 'hover:border-[#2e7ad1]',
                !isChipBox && values.size > 0 && 'border-[#2e7ad1]/35 bg-[#f8fbff]',
                isChipBox && values.size > 0 && 'border-[#2e7ad1]/40 bg-[#fcfdff]',
                open &&
                  (isChipBox
                    ? 'border-[#2e7ad1] shadow-[0_0_0_2px_rgb(46_122_209_/_12%)]'
                    : 'border-[#2e7ad1]/50 shadow-md ring-2 ring-[#2e7ad1]/12'),
              ),
          disabled && 'cursor-not-allowed opacity-55',
        )}
      >
        {isChipBox ? (
          <>
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
              {showChips ? (
                [...values].map((value) => (
                  <span
                    key={value}
                    className="xl-multi-select-chip inline-flex max-w-full items-center gap-1 rounded-[5px] border border-[#c7daf3] bg-[#e8f1fb] px-1.5 py-0.5 text-[11px] font-medium leading-tight text-[#1d4ed8]"
                  >
                    <span className="max-w-[10rem] truncate" title={chipLabel(value)}>
                      {chipLabel(value)}
                    </span>
                    <button
                      type="button"
                      aria-label={`Remove ${chipLabel(value)}`}
                      className="rounded p-0.5 text-[#1d4ed8] hover:bg-[#2e7ad1]/15"
                      onClick={(e) => removeValue(value, e)}
                    >
                      <X className="h-3 w-3" strokeWidth={2.5} />
                    </button>
                  </span>
                ))
              ) : (
                <span className="px-0.5 text-[12px] font-normal text-slate-500">{placeholder}</span>
              )}
            </div>
            <ChevronDown
              className={cn(
                'ml-auto h-4 w-4 shrink-0 self-center text-slate-400 transition-transform duration-200',
                open && 'rotate-180 text-[#2e7ad1]',
              )}
            />
          </>
        ) : (
          <>
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
          </>
        )}
      </button>
      {menu}
    </div>
  );
}
