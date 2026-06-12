'use client';

import {
  Archive,
  ArchiveRestore,
  Bell,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils/cn';
import type { PersonalNote } from '@/types/personal-notes';
import { formatNoteDate, PRIORITY_META, stripHtml } from './note-utils';

interface NoteCardProps {
  note: PersonalNote;
  view?: 'grid' | 'list';
  onEdit: (note: PersonalNote) => void;
  onPin: (note: PersonalNote) => void;
  onArchive: (note: PersonalNote) => void;
  onRestore: (note: PersonalNote) => void;
  onDelete: (note: PersonalNote) => void;
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
  const snippet = stripHtml(note.content).slice(0, 80);
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
        className="group relative w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition-colors hover:border-slate-300 hover:bg-slate-50/80"
      >
        <div className="flex items-start gap-2">
          <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', priority.dot)} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              {note.isPinned && <Pin className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />}
              <span className="line-clamp-1 text-sm font-medium text-slate-900">{note.title}</span>
            </div>
            {snippet && (
              <p className="mt-0.5 line-clamp-2 text-xs text-slate-500">{snippet}</p>
            )}
            <p className="mt-1.5 text-[10px] text-slate-400">{formatNoteDate(note.updatedAt)}</p>
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
    <div className="group flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/80">
      <span className={cn('h-2 w-2 shrink-0 rounded-full', priority.dot)} title={priority.label} />

      <button
        type="button"
        onClick={() => onEdit(note)}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {note.isPinned && <Pin className="h-3 w-3 shrink-0 fill-amber-400 text-amber-500" />}
            <span className="truncate text-sm font-medium text-slate-900">{note.title}</span>
          </div>
          {snippet && (
            <p className="truncate text-xs text-slate-500">{snippet}</p>
          )}
        </div>

        <div className="hidden shrink-0 items-center gap-2 text-[11px] text-slate-400 sm:flex">
          {note.reminderDate && <Bell className="h-3 w-3 text-amber-500" />}
          {note.tags.slice(0, 1).map((tag) => (
            <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
              {tag}
            </span>
          ))}
          <span className="whitespace-nowrap">{formatNoteDate(note.updatedAt)}</span>
        </div>
      </button>

      <div className="shrink-0">{actions}</div>
    </div>
  );
}
