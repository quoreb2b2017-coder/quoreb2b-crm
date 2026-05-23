import { cn } from '@/lib/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  fullWidth?: boolean;
}

export function Button({
  variant = 'primary',
  fullWidth,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg font-semibold text-sm',
        'transition-all duration-200 active:scale-[0.98]',
        'disabled:opacity-50 disabled:pointer-events-none',
        fullWidth && 'w-full',
        variant === 'primary' &&
          'bg-slate-900 text-white hover:bg-brand-600',
        variant === 'secondary' &&
          'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50',
        variant === 'ghost' && 'text-slate-600 hover:bg-slate-100',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
