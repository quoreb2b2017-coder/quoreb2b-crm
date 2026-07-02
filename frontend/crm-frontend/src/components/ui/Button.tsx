import { cn } from '@/lib/utils/cn';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'quore' | 'secondary' | 'ghost';
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
        fullWidth && 'w-full',
        variant === 'primary' && 'crm-btn-primary',
        variant === 'quore' && 'crm-btn-quore',
        variant === 'secondary' && 'crm-btn-secondary',
        variant === 'ghost' && 'crm-btn-ghost',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
