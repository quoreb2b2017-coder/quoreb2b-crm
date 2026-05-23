'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type SideSheetAccent = 'emerald' | 'violet' | 'indigo';

const accentStyles: Record<
  SideSheetAccent,
  { bar: string; header: string; ring: string; btn: string; btnHover: string }
> = {
  emerald: {
    bar: 'from-emerald-500 to-teal-600',
    header: 'bg-gradient-to-br from-[#0d0f14] via-[#111820] to-emerald-950/40',
    ring: 'focus:ring-emerald-500/40 focus:border-emerald-500',
    btn: 'bg-emerald-600 hover:bg-emerald-500',
    btnHover: 'shadow-emerald-500/25',
  },
  violet: {
    bar: 'from-violet-500 to-purple-600',
    header: 'bg-gradient-to-br from-[#0d0f14] via-[#14101f] to-violet-950/40',
    ring: 'focus:ring-violet-500/40 focus:border-violet-500',
    btn: 'bg-violet-600 hover:bg-violet-500',
    btnHover: 'shadow-violet-500/25',
  },
  indigo: {
    bar: 'from-indigo-500 to-blue-600',
    header: 'bg-gradient-to-br from-[#0d0f14] via-[#10131f] to-indigo-950/40',
    ring: 'focus:ring-indigo-500/40 focus:border-indigo-500',
    btn: 'bg-indigo-600 hover:bg-indigo-500',
    btnHover: 'shadow-indigo-500/25',
  },
};

interface SideSheetProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  accent?: SideSheetAccent;
  children: React.ReactNode;
  footer?: React.ReactNode;
  widthClass?: string;
}

export function SideSheet({
  isOpen,
  onClose,
  title,
  subtitle,
  icon,
  accent = 'emerald',
  children,
  footer,
  widthClass = 'w-full max-w-[440px]',
}: SideSheetProps) {
  const a = accentStyles[accent];

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        className="absolute inset-0 bg-black/45 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <aside
        className={cn(
          'relative flex h-full flex-col border-l border-white/10 bg-white shadow-2xl animate-slide-in-right',
          widthClass,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-sheet-title"
      >
        <div className={cn('h-1 w-full bg-gradient-to-r flex-shrink-0', a.bar)} />

        <header className={cn('flex-shrink-0 border-b border-white/10 px-5 py-5 text-white', a.header)}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              {icon && (
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                <h2 id="side-sheet-title" className="text-lg font-semibold tracking-tight truncate">
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-1 text-sm text-slate-400 leading-snug">{subtitle}</p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto overscroll-contain bg-slate-50/80 px-5 py-5">
          {children}
        </div>

        {footer && (
          <footer className="flex-shrink-0 border-t border-slate-200 bg-white px-5 py-4">
            {footer}
          </footer>
        )}
      </aside>
    </div>
  );
}

export function sideSheetFieldClass(accent: SideSheetAccent = 'emerald') {
  return cn(
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-shadow',
    'placeholder:text-slate-400 focus:outline-none focus:ring-2',
    accentStyles[accent].ring,
  );
}

export function sideSheetChipClass(active: boolean, accent: SideSheetAccent = 'emerald') {
  const a = accentStyles[accent];
  return cn(
    'rounded-xl px-3 py-2.5 text-sm font-medium capitalize transition-all',
    active
      ? cn(a.btn, 'text-white shadow-md', a.btnHover)
      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
  );
}

export function sideSheetPrimaryBtn(accent: SideSheetAccent = 'emerald') {
  const a = accentStyles[accent];
  return cn(
    'flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-50',
    a.btn,
    a.btnHover,
  );
}
