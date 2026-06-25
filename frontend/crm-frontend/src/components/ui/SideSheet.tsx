'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type SideSheetAccent = 'emerald' | 'violet' | 'indigo';

const accentStyles: Record<
  SideSheetAccent,
  { bar: string; header: string; ring: string; btn: string; btnHover: string }
> = {
  emerald: {
    bar: 'from-[#2e7ad1] to-[#2568b8]',
    header: 'bg-[#2e7ad1]',
    ring: 'focus:ring-[#2e7ad1]/40 focus:border-[#2e7ad1]',
    btn: 'bg-[#2e7ad1] hover:bg-[#2568b8]',
    btnHover: 'shadow-[#2e7ad1]/25',
  },
  violet: {
    bar: 'from-[#2e7ad1] to-[#2568b8]',
    header: 'bg-[#2e7ad1]',
    ring: 'focus:ring-[#2e7ad1]/40 focus:border-[#2e7ad1]',
    btn: 'bg-[#2e7ad1] hover:bg-[#2568b8]',
    btnHover: 'shadow-[#2e7ad1]/25',
  },
  indigo: {
    bar: 'from-[#2e7ad1] to-[#2568b8]',
    header: 'bg-[#2e7ad1]',
    ring: 'focus:ring-[#2e7ad1]/40 focus:border-[#2e7ad1]',
    btn: 'bg-[#2e7ad1] hover:bg-[#2568b8]',
    btnHover: 'shadow-[#2e7ad1]/25',
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
  widthClass = 'w-full sm:max-w-[440px] lg:max-w-[480px]',
}: SideSheetProps) {
  const a = accentStyles[resolveAccent(accent)];
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

  if (!isOpen || !mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close panel"
        className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-[2px] animate-fade-in"
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed z-[201] flex flex-col border-white/10 bg-white shadow-2xl',
          'inset-x-0 bottom-0 max-h-[min(92dvh,100%)] w-full animate-slide-up rounded-t-2xl border-t',
          'sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-[100dvh] sm:animate-slide-in-right sm:rounded-none sm:border-l sm:border-t-0',
          widthClass,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby="side-sheet-title"
      >
        <div className={cn('h-1 w-full flex-shrink-0 rounded-t-2xl bg-gradient-to-r sm:rounded-none', a.bar)} />

        <header
          className={cn(
            'flex-shrink-0 border-b border-white/10 px-4 py-4 text-white sm:px-5 sm:py-4',
            a.header,
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {icon && (
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15 sm:h-11 sm:w-11">
                  {icon}
                </span>
              )}
              <div className="min-w-0">
                <h2
                  id="side-sheet-title"
                  className="text-base font-semibold tracking-tight sm:text-lg"
                >
                  {title}
                </h2>
                {subtitle && (
                  <p className="mt-0.5 text-sm text-slate-400 leading-snug">{subtitle}</p>
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-slate-50/80 px-4 py-4 sm:px-5 sm:py-4">
          {children}
        </div>

        {footer && (
          <footer className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-4">
            {footer}
          </footer>
        )}
      </aside>
    </>,
    document.body,
  );
}

function resolveAccent(accent: SideSheetAccent): SideSheetAccent {
  return accent in accentStyles ? accent : 'emerald';
}

export function sideSheetFieldClass(accent: SideSheetAccent = 'emerald') {
  const resolved = resolveAccent(accent);
  return cn(
    'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-shadow',
    'placeholder:text-slate-400 focus:outline-none focus:ring-2',
    accentStyles[resolved].ring,
  );
}

export function sideSheetChipClass(active: boolean, accent: SideSheetAccent = 'emerald') {
  const a = accentStyles[resolveAccent(accent)];
  return cn(
    'rounded-xl px-3 py-2.5 text-sm font-medium capitalize transition-all',
    active
      ? cn(a.btn, 'text-white shadow-md', a.btnHover)
      : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50',
  );
}

export function sideSheetPrimaryBtn(accent: SideSheetAccent = 'emerald') {
  const a = accentStyles[resolveAccent(accent)];
  return cn(
    'flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white shadow-lg transition-all disabled:opacity-50',
    a.btn,
    a.btnHover,
  );
}
