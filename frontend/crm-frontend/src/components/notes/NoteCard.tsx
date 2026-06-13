'use client';

import {
  Archive,
  ArchiveRestore,
  Bell,
  Calendar,
  Clock,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import type { PersonalNote } from '@/types/personal-notes';
import { formatNoteDateParts, notePreviewText, PRIORITY_META } from './note-utils';

interface NoteCardProps {
  note: PersonalNote;
  view?: 'grid' | 'list';
  onEdit: (note: PersonalNote) => void;
  onPin: (note: PersonalNote) => void;
  onArchive: (note: PersonalNote) => void;
  onRestore: (note: PersonalNote) => void;
  onDelete: (note: PersonalNote) => void;
}

function NoteDateTime({ iso }: { iso: string | null | undefined }) {
  const { date, time } = formatNoteDateParts(iso);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        <Calendar className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        {date}
      </span>
      <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
        <Clock className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
        {time}
      </span>
    </div>
  );
}

export function NoteCard({
  note,
  view = 'list',
  onEdit,
  onPin,
  onArchive,
  onRestore,
  onDelete,
}: NoteCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const priority = PRIORITY_META[note.priority];
  const snippet = notePreviewText(note.content, 80);
  const noteWhen = note.updatedAt ?? note.createdAt;
  const closeMenu = () => setMenuOpen(false);

  const actions = (
    <div className="flex shrink-0 items-center gap-0.5">
      <button
        type="button"
        onClick={() => onEdit(note)}
        title="Edit"
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        onClick={() => onDelete(note)}
        title="Delete"
        className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
      <div className="relative">
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          title="More"
          className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <>
            <div className="fixed inset-0 z-20" onClick={closeMenu} />
            <div className="absolute right-0 z-30 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              {!note.isArchived && (
                <button
                  type="button"
                  onClick={() => { closeMenu(); onPin(note); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                >
                  {note.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                  {note.isPinned ? 'Unpin' : 'Pin'}
                </button>
              )}
              {note.isArchived ? (
                <button
                  type="button"
                  onClick={() => { closeMenu(); onRestore(note); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                >
                  <ArchiveRestore className="h-3 w-3" /> Restore
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { closeMenu(); onArchive(note); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
                >
                  <Archive className="h-3 w-3" /> Archive
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (view === 'grid') {
    return (
      <button
        type="button"
        onClick={() => onEdit(note)}
        className="group relative w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
      >
        <div className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-r', priority.stripe)} />
        <div className="flex items-start gap-2 pl-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {note.isPinned && <Pin className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />}
              <span className="line-clamp-1 text-sm font-semibold text-slate-900">{note.title}</span>
            </div>
            {snippet && (
              <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{snippet}</p>
            )}
            <div className="mt-2.5">
              <NoteDateTime iso={noteWhen} />
            </div>
          </div>
        </div>
        <div
          className="absolute right-1 top-1 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {actions}
        </div>
      </button>
    );
  }

  return (
    <div className="group relative flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50/90">
      <span
        className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-r', priority.stripe)}
        aria-hidden
      />
      <span
        className={cn('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', priority.dot)}
        title={priority.label}
      />

      <button
        type="button"
        onClick={() => onEdit(note)}
        className="min-w-0 flex-1 text-left"
      >
        <div className="flex items-center gap-1.5">
          {note.isPinned && <Pin className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />}
          <span className="truncate text-[15px] font-semibold leading-snug text-slate-900">
            {note.title}
          </span>
        </div>
        {snippet && (
          <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-500">{snippet}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <NoteDateTime iso={noteWhen} />
          {note.reminderDate && (
            <span title="Reminder set">
              <Bell className="h-3 w-3 text-amber-500" aria-hidden />
            </span>
          )}
          {note.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600"
            >
              {tag}
            </span>
          ))}
        </div>
      </button>

      <div className="shrink-0 pt-0.5 opacity-90 transition-opacity group-hover:opacity-100">
        {actions}
      </div>
    </div>
  );
}
