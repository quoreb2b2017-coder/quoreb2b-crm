'use client';

import { cn } from '@/lib/utils/cn';

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
        'xl-btn',
        variant === 'primary' && 'xl-btn--primary',
        variant === 'danger' && 'xl-btn--danger',
        className,
      )}
    >
      {children}
    </button>
  );
}

export function BatchXlButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="xl-btn xl-btn--xl">
      <span className="xl-btn-badge">XL</span>
      <span>View</span>
    </button>
  );
}
