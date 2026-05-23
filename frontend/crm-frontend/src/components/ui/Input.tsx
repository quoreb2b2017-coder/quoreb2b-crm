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
      <div className="relative">
        {Icon && (
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        )}
        <input
          id={inputId}
          className={cn(
            'w-full rounded-lg border border-slate-200 bg-white py-2.5 text-slate-900',
            'placeholder:text-slate-400 transition-colors duration-150',
            'focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20',
            Icon && 'pl-10 pr-4',
            !Icon && 'px-4',
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

