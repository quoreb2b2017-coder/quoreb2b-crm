'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { useToastStore, type ToastType } from '@/stores/toast.store';

const config: Record<ToastType, {
  icon: React.ReactNode;
  bar: string;
  iconBg: string;
  iconColor: string;
  border: string;
}> = {
  success: {
    bar: 'bg-emerald-500',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-[#2e7ad1]',
    border: 'border-emerald-100',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
    ),
  },
  error: {
    bar: 'bg-red-500',
    iconBg: 'bg-red-50',
    iconColor: 'text-red-600',
    border: 'border-red-100',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>
      </svg>
    ),
  },
  warning: {
    bar: 'bg-amber-500',
    iconBg: 'bg-amber-50',
    iconColor: 'text-amber-600',
    border: 'border-amber-100',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><path d="M12 9v4M12 17h.01"/>
      </svg>
    ),
  },
  info: {
    bar: 'bg-indigo-500',
    iconBg: 'bg-indigo-50',
    iconColor: 'text-[#2e7ad1]',
    border: 'border-indigo-100',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
      </svg>
    ),
  },
};

function ToastItem({ id, type, title, message, duration = 4000 }: {
  id: string; type: ToastType; title: string; message?: string; duration?: number;
}) {
  const remove = useToastStore(s => s.remove);
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);
  const c = config[type];

  // slide-in
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 10);
    return () => clearTimeout(t);
  }, []);

  // progress bar
  useEffect(() => {
    if (duration <= 0) return;
    const interval = 50;
    const step = (interval / duration) * 100;
    const timer = setInterval(() => {
      setProgress(p => {
        if (p <= 0) { clearInterval(timer); return 0; }
        return p - step;
      });
    }, interval);
    return () => clearInterval(timer);
  }, [duration]);

  const dismiss = () => {
    setVisible(false);
    setTimeout(() => remove(id), 300);
  };

  return (
    <div
      className={cn(
        'relative flex items-start gap-3 w-full bg-white rounded-2xl border shadow-lg shadow-slate-200/60 px-4 py-3.5 overflow-hidden',
        visible ? 'toast-enter' : 'toast-exit',
        c.border,
      )}
    >
      {/* Progress bar */}
      <div
        className={cn('absolute bottom-0 left-0 h-[3px] rounded-full transition-all ease-linear', c.bar)}
        style={{ width: `${progress}%`, transitionDuration: '50ms' }}
      />

      {/* Icon */}
      <div className={cn('flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center', c.iconBg)}>
        <span className={cn('w-4 h-4 block', c.iconColor)}>{c.icon}</span>
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 pt-0.5">
        <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
        {message && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{message}</p>}
      </div>

      {/* Close */}
      <button
        onClick={dismiss}
        className="flex-shrink-0 p-1 rounded-lg text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-colors mt-0.5"
      >
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  );
}

export function Toaster() {
  const toasts = useToastStore(s => s.toasts);

  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-[999] flex flex-col gap-2.5 w-full max-w-[360px] pointer-events-none"
    >
      {toasts.map(t => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem {...t} />
        </div>
      ))}
    </div>
  );
}
