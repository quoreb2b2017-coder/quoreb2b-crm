'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type XlSelectOption = { value: string; label: string };

export function XlToolbarSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: XlSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn('relative w-full', className)}>
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'flex w-full items-center justify-between gap-2 border border-white/25 bg-white px-2.5 py-2 text-left text-sm text-slate-800 shadow-sm',
          'transition-all duration-200 ease-out',
          'hover:border-white/50 hover:shadow-md',
          'focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-1 focus:ring-offset-[#217346]',
          open && 'border-white/60 shadow-md ring-2 ring-white/30 ring-offset-1 ring-offset-[#217346]',
          disabled && 'cursor-not-allowed opacity-55',
        )}
      >
        <span className="min-w-0 flex-1 truncate font-medium">
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ease-out',
            open && 'rotate-180 text-[#217346]',
          )}
        />
      </button>

      <div
        className={cn(
          'absolute left-0 right-0 z-[100] mt-1.5 origin-top overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl',
          'transition-all duration-200 ease-out',
          open
            ? 'pointer-events-auto translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-[0.98] opacity-0',
        )}
        role="listbox"
      >
        <ul className="max-h-60 overflow-y-auto overscroll-contain py-1 scrollbar-thin">
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
                        ? 'bg-[#217346] font-medium text-white'
                        : 'text-slate-700 hover:bg-[#e8f5ee] hover:text-[#1a5c38]',
                    )}
                  >
                    <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                    {active ? <Check className="h-3.5 w-3.5 shrink-0 opacity-90" /> : null}
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}
