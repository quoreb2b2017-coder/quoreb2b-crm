'use client';

import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  loading?: boolean;
  id?: string;
  'aria-label'?: string;
  size?: 'sm' | 'md';
  className?: string;
}

const SIZE = {
  sm: {
    track: 'h-6 w-11',
    thumb: 'h-4 w-4',
    on: 'translate-x-5',
    off: 'translate-x-1',
  },
  md: {
    track: 'h-8 w-14',
    thumb: 'h-6 w-6',
    on: 'translate-x-6',
    off: 'translate-x-1',
  },
} as const;

export function Switch({
  checked,
  onChange,
  disabled,
  loading,
  id,
  'aria-label': ariaLabel,
  size = 'md',
  className,
}: SwitchProps) {
  const s = SIZE[size];
  const isDisabled = disabled || loading;

  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      aria-busy={loading}
      disabled={isDisabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'group relative shrink-0 rounded-full p-0.5 transition-all duration-300 ease-out',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-55',
        'hover:scale-[1.03] active:scale-[0.97]',
        s.track,
        checked
          ? 'bg-gradient-to-r from-[#1a6b42] via-[#217346] to-[#2d8f5c] shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_2px_8px_rgba(33,115,70,0.35)]'
          : 'bg-slate-200 shadow-[inset_0_2px_4px_rgba(15,23,42,0.08)]',
        !checked && 'hover:bg-slate-300/90',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 rounded-full transition-opacity duration-300',
          checked ? 'opacity-100' : 'opacity-0',
          'bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.25),transparent_55%)]',
        )}
      />
      <span
        className={cn(
          'relative flex items-center justify-center rounded-full bg-white shadow-[0_1px_3px_rgba(15,23,42,0.18),0_4px_12px_rgba(15,23,42,0.08)]',
          'transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]',
          'group-hover:shadow-[0_2px_6px_rgba(15,23,42,0.2),0_6px_16px_rgba(15,23,42,0.1)]',
          'group-active:scale-95',
          s.thumb,
          checked ? s.on : s.off,
          checked && 'ring-2 ring-white/80',
        )}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#217346]" />
        ) : (
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-all duration-300',
              checked ? 'bg-[#217346] scale-100 opacity-100' : 'bg-slate-300 scale-75 opacity-60',
            )}
          />
        )}
      </span>
    </button>
  );
}
