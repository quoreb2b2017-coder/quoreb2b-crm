'use client';

import { cn } from '@/lib/utils/cn';

/**
 * Forces attendance pages to use the full main content width (sidebar → right edge).
 */
export function AttendanceFullBleed({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'attendance-full-bleed flex min-h-0 w-full max-w-none flex-1 flex-col self-stretch',
        className,
      )}
    >
      {children}
    </div>
  );
}
