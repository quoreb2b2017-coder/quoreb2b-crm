'use client';

import type { ReactNode } from 'react';
import { Database } from 'lucide-react';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { cn } from '@/lib/utils/cn';

interface DataPageShellProps {
  title: string;
  subtitle: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** Full-width data workspace — single horizontal inset (no double padding with layout). */
export function DataPageShell({
  title,
  subtitle,
  actions,
  children,
  className,
}: DataPageShellProps) {
  return (
    <AttendanceFullBleed
      className={cn('gap-4 px-3 py-3 sm:px-4 md:gap-5 md:py-4 animate-fade-in', className)}
    >
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#2568b8] via-[#2e7ad1] to-[#1e5fa8] px-4 py-4 text-white shadow-crm ring-1 ring-[#2e7ad1]/25 sm:px-5 sm:py-5">
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-white/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-sm">
              <Database className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h1>
              <p className="mt-0.5 max-w-2xl text-sm text-white/85">{subtitle}</p>
            </div>
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
      {children}
    </AttendanceFullBleed>
  );
}

export function dataFilterPill(active: boolean) {
  return cn(
    'rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-150',
    active
      ? 'bg-[#2e7ad1] text-white shadow-sm'
      : 'border border-slate-200 bg-white text-slate-600 hover:border-[#2e7ad1]/30 hover:bg-[#e8f1fb]/50',
  );
}

export function dataToolbarSelect(className?: string) {
  return cn(
    'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 outline-none transition-colors hover:border-[#2e7ad1]/40 focus:border-[#2e7ad1] focus:ring-2 focus:ring-[#2e7ad1]/15',
    className,
  );
}

export function dataToolbarBadge(className?: string) {
  return cn(
    'inline-flex items-center rounded-lg border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600',
    className,
  );
}
