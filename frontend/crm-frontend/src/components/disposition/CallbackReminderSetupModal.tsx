'use client';

import { useState } from 'react';
import { Bell, Loader2, X } from 'lucide-react';

interface CallbackReminderSetupModalProps {
  leadLabel: string;
  onCancel: () => void;
  onConfirm: (payload: { hours: 24 | 48; description: string }) => Promise<void>;
}

export function CallbackReminderSetupModal({
  leadLabel,
  onCancel,
  onConfirm,
}: CallbackReminderSetupModalProps) {
  const [hours, setHours] = useState<24 | 48>(24);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    const text = description.trim();
    if (text.length < 2) {
      setError('Add a short description for this callback');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onConfirm({ hours, description: text });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save reminder');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/45 backdrop-blur-[2px]"
        aria-label="Close"
        onClick={onCancel}
      />
      <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-700">Callback</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">Set reminder</h2>
            <p className="mt-1 text-sm text-slate-500 line-clamp-2">{leadLabel}</p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Remind me after</p>
            <div className="grid grid-cols-2 gap-2">
              {([24, 48] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHours(h)}
                  className={`rounded-xl border px-3 py-2.5 text-sm font-bold transition ${
                    hours === h
                      ? 'border-amber-500 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  {h} hours
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-slate-700">
              Short description
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="e.g. Call back after lunch — asked for brochure"
              className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-amber-400"
            />
          </label>

          {error ? <p className="text-sm text-rose-600">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-3.5 py-2 text-sm font-bold text-white hover:bg-amber-600 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Save reminder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
