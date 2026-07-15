'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Loader2, X } from 'lucide-react';
import {
  dispositionService,
  type CallbackReminder,
} from '@/lib/api/disposition.service';
import { extractApiError } from '@/lib/api/errors';

const POLL_MS = 30_000;

/** Due callback reminders — stay open until employee dismisses each one. */
export function CallbackReminderPopupHost() {
  const [due, setDue] = useState<CallbackReminder[]>([]);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const rows = await dispositionService.listDueReminders();
      setDue(rows);
      setError('');
    } catch {
      /* silent — layout still works */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  const dismiss = async (id: string) => {
    setDismissingId(id);
    try {
      await dispositionService.dismissReminder(id);
      setDue((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      setError(extractApiError(e, 'Could not close reminder'));
    } finally {
      setDismissingId(null);
    }
  };

  if (due.length === 0) return null;

  const current = due[0];

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="callback-reminder-title"
        className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-amber-200"
      >
        <div className="mb-3 flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Bell className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">
              Callback reminder · {current.hours}h
            </p>
            <h2 id="callback-reminder-title" className="mt-0.5 text-lg font-bold text-slate-900">
              Time to call back
            </h2>
            <p className="mt-1 text-sm font-medium text-slate-700">
              {current.leadLabel || 'Lead'}
            </p>
            <p className="mt-0.5 text-xs text-slate-500">{current.campaignName}</p>
          </div>
        </div>

        <div className="rounded-xl bg-amber-50 px-3.5 py-3 text-sm text-slate-800 ring-1 ring-amber-100">
          {current.description}
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Due {current.remindAt ? new Date(current.remindAt).toLocaleString() : 'now'}. Close only
          when you have handled this callback
          {due.length > 1 ? ` · ${due.length} open` : ''}.
        </p>

        {error ? <p className="mt-2 text-sm text-rose-600">{error}</p> : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={() => void dismiss(current.id)}
            disabled={dismissingId === current.id}
            className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60"
          >
            {dismissingId === current.id ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <X className="h-4 w-4" />
            )}
            Close reminder
          </button>
        </div>
      </div>
    </div>
  );
}
