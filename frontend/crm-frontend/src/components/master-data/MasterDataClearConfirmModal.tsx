'use client';

import { useEffect, useState } from 'react';
import { Check, Loader2, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const COUNTDOWN_SEC = 5;
const LETTERS = ['D', 'E', 'L', 'E', 'T', 'E'] as const;
const RING_R = 15;
const RING_C = 2 * Math.PI * RING_R;

interface MasterDataClearConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  clearing?: boolean;
}

export function MasterDataClearConfirmModal({
  open,
  onClose,
  onConfirm,
  clearing = false,
}: MasterDataClearConfirmModalProps) {
  const [secondsLeft, setSecondsLeft] = useState(COUNTDOWN_SEC);

  const revealedCount =
    secondsLeft === 0 ? LETTERS.length : Math.min(LETTERS.length, COUNTDOWN_SEC - secondsLeft);

  const canDelete = secondsLeft === 0 && !clearing;
  const progress = ((COUNTDOWN_SEC - secondsLeft) / COUNTDOWN_SEC) * 100;
  const ringOffset = RING_C * (1 - progress / 100);

  useEffect(() => {
    if (!open) {
      setSecondsLeft(COUNTDOWN_SEC);
      return;
    }

    setSecondsLeft(COUNTDOWN_SEC);
    const tick = window.setInterval(() => {
      setSecondsLeft((prev) => (prev <= 0 ? 0 : prev - 1));
    }, 1000);

    return () => window.clearInterval(tick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !clearing) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, clearing]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[60] bg-slate-900/40 backdrop-blur-sm transition-opacity"
        onClick={clearing ? undefined : onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 pointer-events-none">
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-master-title"
          className="pointer-events-auto w-full max-w-[348px] overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_20px_50px_-12px_rgba(15,23,42,0.28)] animate-slide-up"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="h-1 bg-gradient-to-r from-red-500 via-rose-500 to-red-400" />

          <div className="px-4 pb-1 pt-3.5">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-50 to-rose-100 text-red-600 ring-1 ring-red-100">
                <Trash2 className="h-4 w-4" strokeWidth={2.25} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <h2 id="clear-master-title" className="text-[15px] font-semibold tracking-tight text-slate-900">
                  Clear master file?
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  All master rows and every batch will be permanently removed.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={clearing}
                className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mx-4 mb-1 mt-3 rounded-xl border border-slate-200/70 bg-gradient-to-b from-slate-50/90 to-white p-3 shadow-inner shadow-slate-100/50">
            <div className="flex items-center gap-3">
              <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
                <svg className="absolute inset-0 -rotate-90" width="36" height="36" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r={RING_R}
                    fill="none"
                    stroke="#e2e8f0"
                    strokeWidth="2.5"
                  />
                  <circle
                    cx="18"
                    cy="18"
                    r={RING_R}
                    fill="none"
                    stroke={canDelete ? '#22c55e' : '#ef4444'}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeDasharray={RING_C}
                    strokeDashoffset={ringOffset}
                    className="transition-all duration-1000 ease-linear"
                  />
                </svg>
                <span
                  className={cn(
                    'relative text-[11px] font-bold tabular-nums transition-colors duration-300',
                    canDelete ? 'text-emerald-600' : 'text-slate-700',
                  )}
                >
                  {canDelete ? (
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  ) : (
                    secondsLeft
                  )}
                </span>
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {canDelete ? 'Ready' : 'Hold to confirm'}
                </p>
                <div className="mt-1.5 flex items-center gap-1">
                  {LETTERS.map((char, i) => {
                    const revealed = i < revealedCount;
                    return (
                      <span
                        key={i}
                        className={cn(
                          'flex h-7 w-[22px] items-center justify-center rounded-md text-[11px] font-bold transition-all duration-300',
                          revealed
                            ? 'scale-100 bg-red-500 text-white shadow-sm shadow-red-500/35'
                            : 'scale-95 bg-slate-100 text-slate-300',
                        )}
                        style={{ transitionDelay: revealed ? `${i * 45}ms` : '0ms' }}
                      >
                        {revealed ? char : ''}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-2.5 px-4 py-3.5">
            <button
              type="button"
              onClick={onClose}
              disabled={clearing}
              className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={!canDelete}
              className={cn(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all active:scale-[0.98]',
                canDelete
                  ? 'bg-gradient-to-b from-red-500 to-red-600 text-white shadow-md shadow-red-500/30 hover:from-red-600 hover:to-red-700'
                  : 'cursor-not-allowed bg-slate-100 text-slate-400 shadow-none',
              )}
            >
              {clearing ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Clearing…
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete all
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
