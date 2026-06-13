'use client';

import './dashboard.css';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils/cn';

export function DashboardPageShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('dash-page dash-stagger space-y-5', className)}>
      {children}
    </div>
  );
}
