'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Pin, Trash2, X } from 'lucide-react';
import { PRIORITY_META, stripHtml } from '@/components/notes/note-utils';
import { personalNotesService } from '@/lib/api/personal-notes.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import type { NotePriority, PersonalNote } from '@/types/personal-notes';
import type { SideSheetAccent } from '@/components/ui/SideSheet';
import { cn } from '@/lib/utils/cn';

interface NoteEditorModalProps {
  open: boolean;
  note?: PersonalNote | null;
  onClose: () => void;
  onSaved: (saved: PersonalNote, isCreate: boolean) => void | Promise<void>;
  onDelete?: (note: PersonalNote) => void | Promise<void>;
  accent?: SideSheetAccent;
  /** Docked inside the page layout (full height) instead of floating modal */
  embedded?: boolean;
}

const PRIORITIES: NotePriority[] = ['low', 'medium', 'high'];

const ACCENT_BTN: Record<SideSheetAccent, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/30',
  indigo: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500/30',
  violet: 'bg-violet-600 hover:bg-violet-700 focus:ring-violet-500/30',
};

const ACCENT_TOP: Record<SideSheetAccent, string> = {
  emerald: 'border-t-emerald-500',
  indigo: 'border-t-indigo-500',
  violet: 'border-t-violet-500',
};

const fieldClass =
  'w-full min-w-0 max-w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200/80';

const dateFieldClass =
  'note-date-input w-full min-w-0 max-w-full box-border rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-400 focus:ring-2 focus:ring-slate-200/80 [color-scheme:light]';

function splitReminderValue(value: string): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  const [date, time] = value.split('T');
  return { date: date ?? '', time: time?.slice(0, 5) ?? '' };
}

function ReminderField({
  date,
  time,
  onDateChange,
  onTimeChange,
  onClear,
}: {
  date: string;
  time: string;
  onDateChange: (v: string) => void;
  onTimeChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="space-y-1.5 overflow-visible">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-slate-500">Reminder</span>
        {(date || time) && (
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-medium text-slate-400 hover:text-rose-600"
          >
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="min-w-0 w-full">
          <label htmlFor="note-reminder-date" className="mb-1 block text-[10px] font-medium text-slate-400">
            Date
          </label>
          <input
            id="note-reminder-date"
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className={dateFieldClass}
          />
        </div>
        <div className="min-w-0 w-full">
          <label htmlFor="note-reminder-time" className="mb-1 block text-[10px] font-medium text-slate-400">
            Time
          </label>
          <input
            id="note-reminder-time"
            type="time"
            value={time}
            onChange={(e) => onTimeChange(e.target.value)}
            disabled={!date}
            className={cn(dateFieldClass, !date && 'cursor-not-allowed opacity-50')}
          />
        </div>
      </div>
    </div>
  );
}

export function NoteEditorModal({
  open,
  note,
  onClose,
  onSaved,
  onDelete,
  accent = 'emerald',
  embedded = false,
}: NoteEditorModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [priority, setPriority] = useState<NotePriority>('medium');
  const [isPinned, setIsPinned] = useState(false);
  const [reminderDatePart, setReminderDatePart] = useState('');
  const [reminderTimePart, setReminderTimePart] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(note?.title ?? '');
    setContent(note?.content ? stripHtml(note.content) : '');
    setTagsInput(note?.tags?.join(', ') ?? '');
    setPriority(note?.priority ?? 'medium');
    setIsPinned(note?.isPinned ?? false);
    const reminder = splitReminderValue(note?.reminderDate ? note.reminderDate.slice(0, 16) : '');
    setReminderDatePart(reminder.date);
    setReminderTimePart(reminder.time);
    setShowMore(Boolean(note?.tags?.length || note?.reminderDate));
    setError('');
  }, [open, note]);

  useEffect(() => {
    if (!open || embedded) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, embedded]);

  if (!open) return null;

  const tags = tagsInput
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        title: title.trim(),
        content: content.trim(),
        tags,
        priority,
        isPinned,
        reminderDate: reminderDatePart
          ? new Date(`${reminderDatePart}T${reminderTimePart || '09:00'}`).toISOString()
          : null,
      };
      let saved: PersonalNote;
      const isCreate = !note?.id;
      if (note?.id) {
        saved = await personalNotesService.update(note.id, payload);
        toast.success('Note updated');
      } else {
        saved = await personalNotesService.create(payload);
        toast.success('Note created');
      }
      await onSaved(saved, isCreate);
      onClose();
    } catch (e) {
      setError(extractApiError(e, 'Could not save note'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!note?.id || !onDelete) return;
    if (!window.confirm(`Delete "${note.title}" permanently?`)) return;
    setDeleting(true);
    try {
      await onDelete(note);
      onClose();
    } finally {
      setDeleting(false);
    }
  };

  const busy = saving || deleting;

  const panel = (
    <aside
      className={cn(
        'flex h-full min-h-0 min-w-0 flex-col border-slate-200 bg-white',
        'border-t-2',
        ACCENT_TOP[accent],
        embedded
          ? 'w-full max-w-full border-l'
          : 'fixed inset-y-0 right-0 z-[101] h-screen w-full max-w-[400px] border-l shadow-2xl animate-slide-in-right max-lg:inset-0 max-lg:max-w-none',
      )}
      role="dialog"
      aria-modal={!embedded}
      aria-labelledby="note-editor-title"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 id="note-editor-title" className="text-sm font-semibold text-slate-900">
            {note?.id ? 'Edit note' : 'New note'}
          </h2>
          <p className="text-[11px] text-slate-500">Private — only you can see this</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        <div className="flex w-full min-w-0 flex-col gap-4">
          <div className="w-full shrink-0">
            <label htmlFor="note-title" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Title <span className="text-rose-500">*</span>
            </label>
            <input
              id="note-title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Note title"
              className={cn(fieldClass, 'font-medium')}
            />
          </div>

          <div className="w-full shrink-0">
            <label htmlFor="note-content" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Note
            </label>
            <textarea
              id="note-content"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write here…"
              rows={4}
              className={cn(fieldClass, 'block h-28 resize-none leading-relaxed')}
            />
          </div>

          <div className="w-full shrink-0">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Priority</p>
            <div className="flex flex-wrap gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(p)}
                  className={cn(
                    'rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-all',
                    priority === p
                      ? cn(PRIORITY_META[p].softBg, PRIORITY_META[p].text, 'ring-current/25')
                      : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {PRIORITY_META[p].label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setIsPinned((v) => !v)}
                className={cn(
                  'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition-all',
                  isPinned
                    ? 'bg-amber-50 text-amber-800 ring-amber-200'
                    : 'bg-white text-slate-500 ring-slate-200 hover:bg-slate-50',
                )}
              >
                <Pin className={cn('h-3 w-3', isPinned && 'fill-amber-400')} />
                Pin
              </button>
            </div>
          </div>

          <div className="w-full shrink-0">
            <button
              type="button"
              onClick={() => setShowMore((v) => !v)}
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
            >
              Tags &amp; reminder
              <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', showMore && 'rotate-180')} />
            </button>
            {showMore && (
              <div className="mt-2 w-full space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                <div>
                  <label htmlFor="note-tags" className="mb-1.5 block text-[11px] font-medium text-slate-500">
                    Tags
                  </label>
                  <input
                    id="note-tags"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    placeholder="e.g. client, follow-up"
                    className={fieldClass}
                  />
                </div>
                <ReminderField
                  date={reminderDatePart}
                  time={reminderTimePart}
                  onDateChange={(v) => {
                    setReminderDatePart(v);
                    if (!v) setReminderTimePart('');
                  }}
                  onTimeChange={setReminderTimePart}
                  onClear={() => {
                    setReminderDatePart('');
                    setReminderTimePart('');
                  }}
                />
              </div>
            )}
          </div>

          {error && (
            <p className="shrink-0 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
        {note?.id && onDelete && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete
          </button>
        )}
        <div className="ml-auto flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={busy}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold text-white shadow-sm focus:outline-none focus:ring-2 disabled:opacity-50',
              ACCENT_BTN[accent],
            )}
          >
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {note?.id ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </aside>
  );

  if (embedded) return panel;

  return (
    <>
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 z-[100] bg-black/40 animate-fade-in lg:hidden"
        onClick={onClose}
      />
      {panel}
    </>
  );
}
