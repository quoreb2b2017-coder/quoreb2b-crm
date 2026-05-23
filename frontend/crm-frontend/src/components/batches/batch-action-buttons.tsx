'use client';

import { cn } from '@/lib/utils/cn';

const base =
  'inline-flex shrink-0 items-center justify-center gap-1 whitespace-nowrap border border-slate-300 bg-[#f3f3f3] px-2 py-0.5 text-[10px] font-medium leading-none text-slate-700 hover:bg-white active:bg-[#e2efda]';

export function BatchActionButton({
  children,
  onClick,
  disabled,
  variant = 'default',
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger';
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        base,
        variant === 'primary' && 'border-[#217346] text-[#217346] hover:bg-[#e2efda]',
        variant === 'danger' && 'border-red-300 text-red-700 hover:bg-red-50',
        disabled && 'opacity-50',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BatchXlButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        base,
        'gap-1 border-[#217346] bg-[#217346] px-2.5 text-white hover:bg-[#1a5c38]',
      )}
    >
      <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center border border-white/40 text-[8px] font-bold leading-none">
        XL
      </span>
      <span>View</span>
    </button>
  );
}
