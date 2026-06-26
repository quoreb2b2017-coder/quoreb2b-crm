import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: LucideIcon;
}

export function Input({ label, error, icon: Icon, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s/g, '-');

  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      <div className={cn('relative', Icon && 'crm-input-wrap--icon')}>
        {Icon && (
          <span className="crm-input-icon" aria-hidden>
            <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'crm-input',
            Icon && 'crm-input--has-icon',
            error && 'border-red-300 focus:border-red-400 focus:ring-red-400/20',
            className,
          )}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
