'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, ExternalLink, Loader2, StickyNote, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { personalNotesService } from '@/lib/api/personal-notes.service';
import { extractApiError } from '@/lib/api/errors';
import {
  formatNoteDateTime,
  notePreviewText,
  stripHtml,
  stripNoteStamp,
} from '@/components/notes/note-utils';
import { toast } from '@/stores/toast.store';
import { useQuickNoteStore } from '@/store/quick-note.store';
import type { DashboardVariant } from '@/components/layout/DashboardLayout';
import type { PersonalNote } from '@/types/personal-notes';

const ACCENT: Record<
  DashboardVariant,
  { fab: string; fabRing: string; header: string; btn: string; link: string }
> = {
  employee: {
    fab: 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-900/30',
    fabRing: 'ring-emerald-400/40',
    header: 'border-t-emerald-500 bg-emerald-50/80',
    btn: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500/30',
    link: 'text-emerald-700 hover:text-emerald-900',
  },
  admin: {
    fab: 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-900/30',
    fabRing: 'ring-indigo-400/40',
    header: 'border-t-indigo-500 bg-indigo-50/80',
    btn: 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500/30',
    link: 'text-indigo-700 hover:text-indigo-900',
  },
  db_admin: {
    fab: 'bg-violet-600 hover:bg-violet-700 shadow-violet-900/30',
    fabRing: 'ring-violet-400/40',
    header: 'border-t-violet-500 bg-violet-50/80',
    btn: 'bg-violet-600 hover:bg-violet-700 focus:ring-violet-500/30',
    link: 'text-violet-700 hover:text-violet-900',
  },
};

function personalNotesHref(variant: DashboardVariant): string {
  if (variant === 'admin') return '/admin/personal-notes';
  if (variant === 'db_admin') return '/db-admin/personal-notes';
  return '/employee/personal-notes';
}

const QUICK_OPEN_LIMIT = 2;

function defaultTitle(content: string, capturedAt: Date): string {
  const line = content.trim().split('\n')[0]?.slice(0, 80);
  if (line) return line;
  return `Note · ${formatNoteDateTime(capturedAt)}`;
}

interface QuickNotePadProps {
  variant: DashboardVariant;
}

export function QuickNotePad({ variant }: QuickNotePadProps) {
  const accent = ACCENT[variant];
  const notesHref = personalNotesHref(variant);
  const { open, editingNote, openPad, closePad, togglePad } = useQuickNoteStore();

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [recent, setRecent] = useState<PersonalNote[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [capturedAt, setCapturedAt] = useState<Date | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const resetForm = useCallback((note: PersonalNote | null) => {
    if (note) {
      setTitle(note.title ?? '');
      setContent(note.content ? stripNoteStamp(stripHtml(note.content)) : '');
      setCapturedAt(null);
    } else {
      setCapturedAt(new Date());
      setTitle('');
      setContent('');
    }
    setError('');
  }, []);

  const loadRecent = useCallback(async () => {
    setLoadingRecent(true);
    try {
      const data = await personalNotesService.getRecent();
      const merged = [...data.pinned, ...data.recent.filter((n) => !data.pinned.some((p) => p.id === n.id))];
      setRecent(merged.slice(0, QUICK_OPEN_LIMIT));
    } catch {
      setRecent([]);
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm(editingNote);
    void loadRecent();
    const id = window.setTimeout(() => {
      if (editingNote) contentRef.current?.focus();
      else titleRef.current?.focus();
    }, 50);
    return () => window.clearTimeout(id);
  }, [open, editingNote, resetForm, loadRecent]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        togglePad();
      }
      if (e.key === 'Escape' && open) closePad();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, togglePad, closePad]);

  const handleSave = async () => {
    const body = content.trim();
    const isCreate = !editingNote?.id;
    if (!title.trim() && !body) {
      setError('Add a title or write something in the note');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const at = capturedAt ?? new Date();
      const payload = {
        title: title.trim() || defaultTitle(body, at),
        content: body,
        priority: 'medium' as const,
      };
      let saved: PersonalNote;
      if (editingNote?.id) {
        saved = await personalNotesService.update(editingNote.id, payload);
        toast.success('Note updated');
      } else {
        saved = await personalNotesService.create(payload);
        toast.success('Saved to Personal Notes');
      }
      window.dispatchEvent(new CustomEvent('personal-notes:refresh'));
      closePad();
      void loadRecent();
      return saved;
    } catch (e) {
      setError(extractApiError(e, 'Could not save note'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => (open ? closePad() : openPad())}
        className={cn(
          'fixed bottom-6 right-6 z-[90] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ring-4 transition-transform hover:scale-105 active:scale-95',
          accent.fab,
          accent.fabRing,
          open && 'rotate-0',
        )}
        title="Quick note (Ctrl+Shift+N)"
        aria-label={open ? 'Close quick note' : 'Open quick note'}
        aria-expanded={open}
      >
        {open ? <X className="h-6 w-6" /> : <StickyNote className="h-6 w-6" />}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-[1px] animate-fade-in lg:bg-transparent lg:backdrop-blur-none"
            onClick={closePad}
          />
          <aside
            className={cn(
              'fixed z-[110] flex max-h-[min(85vh,640px)] w-[min(100vw-1.5rem,400px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl',
              'bottom-24 right-4 sm:right-6 animate-slide-in-right border-t-4',
              accent.header,
            )}
            role="dialog"
            aria-modal="true"
            aria-label="Quick note"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {editingNote ? 'Edit note' : 'Quick note'}
                </h2>
                <p className="text-[11px] text-slate-500">Saves to Personal Notes</p>
              </div>
              <Link
                href={notesHref}
                onClick={closePad}
                className={cn('inline-flex items-center gap-1 text-[11px] font-semibold', accent.link)}
              >
                All notes
                <ExternalLink className="h-3 w-3" />
              </Link>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="space-y-3">
                {!editingNote && capturedAt && (
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span>
                      <span className="font-semibold text-slate-700">Date &amp; time: </span>
                      {formatNoteDateTime(capturedAt)}
                    </span>
                  </div>
                )}
                <div>
                  <label
                    htmlFor="quick-note-title"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Title
                  </label>
                  <input
                    id="quick-note-title"
                    ref={titleRef}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Client call, follow-up…"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200/80"
                  />
                </div>
                <div>
                  <label
                    htmlFor="quick-note-content"
                    className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500"
                  >
                    Note
                  </label>
                <textarea
                  id="quick-note-content"
                  ref={contentRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Write your note here…"
                  rows={6}
                  className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-sm leading-relaxed outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200/80"
                />
                </div>
                {error && (
                  <p className="rounded-md bg-rose-50 px-2 py-1.5 text-xs text-rose-700">{error}</p>
                )}

                <div className="border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    Quick open
                  </p>
                  {loadingRecent ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                    </div>
                  ) : recent.length === 0 ? (
                    <p className="text-xs text-slate-400">No recent notes yet</p>
                  ) : (
                    <ul className="space-y-1">
                      {recent.map((note) => (
                        <li key={note.id}>
                          <button
                            type="button"
                            onClick={() => openPad(note)}
                            className="w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                          >
                            <span className="block truncate font-semibold text-slate-800">
                              {note.title}
                            </span>
                            <span className="block truncate text-slate-500">
                              {notePreviewText(note.content, 60) || '—'}
                            </span>
                            <span className="mt-0.5 block truncate text-[10px] text-slate-400">
                              {formatNoteDateTime(note.updatedAt ?? note.createdAt)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
              <button
                type="button"
                onClick={closePad}
                disabled={saving}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className={cn(
                  'ml-auto inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold text-white shadow-sm disabled:opacity-50',
                  accent.btn,
                )}
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {editingNote ? 'Update' : 'Save note'}
              </button>
            </div>
          </aside>
        </>
      )}
    </>
  );
}
