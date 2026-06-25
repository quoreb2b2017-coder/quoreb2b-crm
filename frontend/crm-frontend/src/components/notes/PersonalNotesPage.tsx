'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Archive,
  Grid3X3,
  LayoutList,
  Loader2,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Star,
  StickyNote,
  Tag,
  X,
} from 'lucide-react';
import { NoteCard } from '@/components/notes/NoteCard';
import { NoteEditorModal } from '@/components/notes/NoteEditorModal';
import type { SideSheetAccent } from '@/components/ui/SideSheet';
import { personalNotesService } from '@/lib/api/personal-notes.service';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import type {
  ListNotesParams,
  NoteSidebarFilter,
  NotesViewMode,
  PersonalNote,
} from '@/types/personal-notes';
import { cn } from '@/lib/utils/cn';

export type NotesPanelVariant = 'employee' | 'admin' | 'db_admin';

const CRM_NOTES_THEME = {
  hero: 'from-[#2568b8] via-[#2e7ad1] to-[#1e5fa8]',
  accentBar: 'bg-white/25',
  glow: 'bg-white/10',
  btn: 'bg-white text-[#2e7ad1] hover:bg-[#e8f1fb]',
  btnShadow: 'shadow-[#2568b8]/20',
  navActive: 'bg-[#e8f1fb] text-[#2568b8] shadow-sm ring-1 ring-[#2e7ad1]/20',
  navIcon: 'text-[#2e7ad1]',
  searchFocus: 'focus:border-[#2e7ad1] focus:ring-[#2e7ad1]/20',
  tagActive: 'bg-[#2e7ad1] text-white ring-[#2568b8]',
  sheet: 'emerald' as SideSheetAccent,
};

const THEME: Record<
  NotesPanelVariant,
  {
    hero: string;
    accentBar: string;
    glow: string;
    btn: string;
    btnShadow: string;
    navActive: string;
    navIcon: string;
    searchFocus: string;
    tagActive: string;
    sheet: SideSheetAccent;
  }
> = {
  employee: CRM_NOTES_THEME,
  admin: CRM_NOTES_THEME,
  db_admin: CRM_NOTES_THEME,
};

const SIDEBAR_ITEMS: Array<{ id: NoteSidebarFilter; label: string; icon: React.ReactNode }> = [
  { id: 'all', label: 'All Notes', icon: <StickyNote className="h-4 w-4" /> },
  { id: 'pinned', label: 'Pinned', icon: <Pin className="h-4 w-4" /> },
  { id: 'important', label: 'Important', icon: <Star className="h-4 w-4" /> },
  { id: 'archived', label: 'Archived', icon: <Archive className="h-4 w-4" /> },
];

interface PersonalNotesPageProps {
  variant?: NotesPanelVariant;
}

function SectionHeader({
  title,
  count,
  icon,
}: {
  title: string;
  count?: number;
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
        {icon}
        {title}
      </h2>
      {count !== undefined && count > 0 && (
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
          {count}
        </span>
      )}
    </div>
  );
}

function NoteSkeleton() {
  return (
    <div className="flex animate-pulse items-start gap-3 px-4 py-3.5">
      <div className="mt-2 h-2.5 w-2.5 rounded-full bg-slate-200" />
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 rounded bg-slate-100" />
        <div className="h-3.5 w-2/3 rounded bg-slate-100" />
        <div className="flex gap-2">
          <div className="h-5 w-28 rounded-md bg-slate-100" />
          <div className="h-5 w-16 rounded-md bg-slate-100" />
        </div>
      </div>
    </div>
  );
}

function NoteList({
  children,
  view,
}: {
  children: React.ReactNode;
  view: NotesViewMode;
}) {
  if (view === 'grid') {
    return (
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white divide-y divide-slate-100">
      {children}
    </div>
  );
}

export function PersonalNotesPage({ variant = 'employee' }: PersonalNotesPageProps) {
  const theme = THEME[variant];
  const [filter, setFilter] = useState<NoteSidebarFilter>('all');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [viewMode, setViewMode] = useState<NotesViewMode>('list');
  const [tags, setTags] = useState<string[]>([]);
  const [pinned, setPinned] = useState<PersonalNote[]>([]);
  const [notes, setNotes] = useState<PersonalNote[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<PersonalNote | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const listGenerationRef = useRef(0);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const buildParams = useCallback(
    (pageNum: number) => ({
      page: pageNum,
      limit: 12,
      search: debouncedSearch || undefined,
      filter: selectedTag ? undefined : filter === 'all' ? undefined : filter,
      tags: selectedTag ?? undefined,
      isArchived: filter === 'archived' ? true : undefined,
    }),
    [debouncedSearch, filter, selectedTag],
  );

  const loadRecent = useCallback(async () => {
    try {
      const recent = await personalNotesService.getRecent();
      setPinned(recent.pinned);
    } catch {
      setPinned([]);
    }
  }, []);

  const loadTags = useCallback(async () => {
    try {
      setTags(await personalNotesService.getTags());
    } catch {
      setTags([]);
    }
  }, []);

  const loadFirstPage = useCallback(async (overrides?: Partial<ListNotesParams>) => {
    const generation = ++listGenerationRef.current;
    setLoading(true);
    setError('');
    setPage(1);
    try {
      const res = await personalNotesService.list({ ...buildParams(1), ...overrides });
      if (generation !== listGenerationRef.current) return;
      setNotes(res.data);
      setTotalCount(res.meta.total);
      setHasMore(res.meta.hasNextPage);
    } catch (e) {
      if (generation !== listGenerationRef.current) return;
      setError(extractApiError(e, 'Could not load notes'));
      setNotes([]);
      setTotalCount(0);
      setHasMore(false);
    } finally {
      if (generation === listGenerationRef.current) setLoading(false);
    }
  }, [buildParams]);

  const loadMorePage = useCallback(async (pageNum: number) => {
    const generation = listGenerationRef.current;
    setLoadingMore(true);
    try {
      const res = await personalNotesService.list(buildParams(pageNum));
      if (generation !== listGenerationRef.current) return;
      setNotes((prev) => [...prev, ...res.data]);
      setHasMore(res.meta.hasNextPage);
    } catch (e) {
      toast.error(extractApiError(e, 'Could not load more notes'));
    } finally {
      if (generation === listGenerationRef.current) setLoadingMore(false);
    }
  }, [buildParams]);

  const refreshAll = useCallback(async (overrides?: Partial<ListNotesParams>) => {
    await Promise.all([loadRecent(), loadTags(), loadFirstPage(overrides)]);
  }, [loadRecent, loadTags, loadFirstPage]);

  const handleSaved = useCallback(async (saved: PersonalNote, isCreate: boolean) => {
    if (isCreate) {
      setFilter('all');
      setSelectedTag(null);
      setSearch('');
      setDebouncedSearch('');
      setNotes((prev) => [saved, ...prev.filter((n) => n.id !== saved.id)]);
      if (saved.isPinned) {
        setPinned((prev) => [saved, ...prev.filter((n) => n.id !== saved.id)]);
      }
    } else {
      setNotes((prev) => prev.map((n) => (n.id === saved.id ? saved : n)));
      setPinned((prev) => {
        if (saved.isPinned && !saved.isArchived) {
          const rest = prev.filter((n) => n.id !== saved.id);
          return [saved, ...rest];
        }
        return prev.filter((n) => n.id !== saved.id);
      });
    }
    try {
      const listOverrides = isCreate
        ? { search: undefined, filter: undefined, tags: undefined, isArchived: undefined }
        : undefined;
      await refreshAll(listOverrides);
    } catch (e) {
      toast.error(extractApiError(e, 'Could not refresh notes'));
    }
  }, [refreshAll]);

  useEffect(() => {
    refreshAll();
  }, [debouncedSearch, filter, selectedTag]);

  useEffect(() => {
    const onRefresh = () => {
      void refreshAll();
    };
    window.addEventListener('personal-notes:refresh', onRefresh);
    return () => window.removeEventListener('personal-notes:refresh', onRefresh);
  }, [refreshAll]);

  useEffect(() => {
    if (page > 1) loadMorePage(page);
  }, [page, loadMorePage]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !hasMore || loading || loadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setPage((p) => p + 1);
      },
      { rootMargin: '120px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, notes.length]);

  const openCreate = () => {
    setEditingNote(null);
    setEditorOpen(true);
  };

  const openEdit = (note: PersonalNote) => {
    setEditingNote(note);
    setEditorOpen(true);
  };

  const handlePin = async (note: PersonalNote) => {
    try {
      if (note.isPinned) await personalNotesService.unpin(note.id);
      else await personalNotesService.pin(note.id);
      toast.success(note.isPinned ? 'Unpinned' : 'Pinned');
      refreshAll();
    } catch (e) {
      toast.error(extractApiError(e, 'Action failed'));
    }
  };

  const handleArchive = async (note: PersonalNote) => {
    try {
      await personalNotesService.archive(note.id);
      toast.success('Archived');
      refreshAll();
    } catch (e) {
      toast.error(extractApiError(e, 'Archive failed'));
    }
  };

  const handleRestore = async (note: PersonalNote) => {
    try {
      await personalNotesService.restore(note.id);
      toast.success('Restored');
      refreshAll();
    } catch (e) {
      toast.error(extractApiError(e, 'Restore failed'));
    }
  };

  const handleDelete = async (note: PersonalNote) => {
    if (!window.confirm(`Delete "${note.title}" permanently?`)) return;
    try {
      await personalNotesService.remove(note.id);
      toast.success('Deleted');
      refreshAll();
    } catch (e) {
      toast.error(extractApiError(e, 'Delete failed'));
    }
  };

  const showPinnedSection = filter === 'all' && !debouncedSearch && !selectedTag && pinned.length > 0;
  const sectionTitle =
    filter === 'archived' ? 'Archived' : filter === 'pinned' ? 'Pinned' : filter === 'important' ? 'Important' : 'All notes';

  const notesBody = (
    <>
      <div className="shrink-0 space-y-2 border-b border-slate-200 px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search by title, content, or tag…"
                className={cn(
                  'w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-10 text-sm text-slate-800 shadow-sm outline-none transition-all placeholder:text-slate-400 focus:ring-4',
                  theme.searchFocus,
                )}
              />
              {search && (
                <button
                  type="button"
                  onClick={() => { setSearch(''); setPage(1); }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                title="Grid view"
                className={cn(
                  'rounded-lg p-2 transition-all',
                  viewMode === 'grid'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                )}
              >
                <Grid3X3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                title="List view"
                className={cn(
                  'rounded-lg p-2 transition-all',
                  viewMode === 'list'
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700',
                )}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <div className="mx-0.5 h-5 w-px bg-slate-200" />
              <button
                type="button"
                onClick={() => refreshAll()}
                title="Refresh"
                className="rounded-lg p-2 text-slate-500 transition-all hover:bg-slate-50 hover:text-slate-700"
              >
                <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
              </button>
              <button
                type="button"
                onClick={openCreate}
                className={cn(
                  'rounded-lg p-2 text-white md:hidden',
                  'bg-[#2e7ad1]',
                )}
                title="New note"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {(selectedTag || debouncedSearch) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-slate-500">Active filters:</span>
              {debouncedSearch && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  Search: &ldquo;{debouncedSearch}&rdquo;
                  <button type="button" onClick={() => setSearch('')} className="ml-0.5 text-slate-400 hover:text-slate-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {selectedTag && (
                <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                  Tag: {selectedTag}
                  <button type="button" onClick={() => setSelectedTag(null)} className="ml-0.5 text-slate-400 hover:text-slate-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
              {error}
            </div>
          )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 sm:px-4">
          {loading ? (
            <NoteList view="list">
              {Array.from({ length: 5 }).map((_, i) => (
                <NoteSkeleton key={i} />
              ))}
            </NoteList>
          ) : (
            <>
              {showPinnedSection && (
                <section>
                  <SectionHeader
                    title="Pinned"
                    count={pinned.length}
                    icon={<Pin className="h-4 w-4 text-amber-500" />}
                  />
                  <NoteList view={viewMode}>
                    {pinned.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        view={viewMode}
                        onEdit={openEdit}
                        onPin={handlePin}
                        onArchive={handleArchive}
                        onRestore={handleRestore}
                        onDelete={handleDelete}
                      />
                    ))}
                  </NoteList>
                </section>
              )}

              <section>
                <SectionHeader
                  title={sectionTitle}
                  count={notes.length}
                  icon={<StickyNote className="h-4 w-4 text-slate-500" />}
                />

                {notes.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center">
                    <StickyNote className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-700">No notes found</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {debouncedSearch || selectedTag || filter !== 'all'
                        ? 'Change filter or search.'
                        : 'Click New Note to create one.'}
                    </p>
                  </div>
                ) : (
                  <NoteList view={viewMode}>
                    {notes.map((note) => (
                      <NoteCard
                        key={note.id}
                        note={note}
                        view={viewMode}
                        onEdit={openEdit}
                        onPin={handlePin}
                        onArchive={handleArchive}
                        onRestore={handleRestore}
                        onDelete={handleDelete}
                      />
                    ))}
                  </NoteList>
                )}

                <div ref={sentinelRef} className="h-6" />
                {loadingMore && (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                )}
              </section>
            </>
          )}
      </div>
    </>
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-white">
      {/* Top bar — full width */}
      <header className={cn('relative shrink-0 bg-gradient-to-r px-4 py-3 sm:px-5', theme.hero)}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-base font-bold text-white sm:text-lg">Personal Notes</h1>
            <p className="text-[11px] text-white/75">
              {!loading ? `${totalCount} notes` : 'Loading…'} · private to you
            </p>
          </div>
          {!editorOpen && (
            <button
              type="button"
              onClick={openCreate}
              className={cn(
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold shadow-md',
                theme.btn,
                theme.btnShadow,
              )}
            >
              <Plus className="h-4 w-4" />
              New Note
            </button>
          )}
        </div>
      </header>

      {/* Body — fills remaining height */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* Folders sidebar */}
        <aside className="hidden w-[200px] shrink-0 flex-col border-r border-slate-200 bg-slate-50/50 md:flex">
          <div className="flex-1 overflow-y-auto p-3">
            <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Folders</p>
            <nav className="space-y-0.5">
              {SIDEBAR_ITEMS.map((item) => {
                const active = filter === item.id && !selectedTag;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => { setFilter(item.id); setSelectedTag(null); setPage(1); }}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition-all',
                      active ? theme.navActive : 'text-slate-600 hover:bg-white',
                    )}
                  >
                    <span className={cn(active ? theme.navIcon : 'text-slate-400')}>{item.icon}</span>
                    {item.label}
                  </button>
                );
              })}
            </nav>
            {tags.length > 0 && (
              <div className="mt-4 border-t border-slate-200 pt-3">
                <p className="mb-2 flex items-center gap-1 px-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Tag className="h-3 w-3" /> Tags
                </p>
                <div className="flex flex-wrap gap-1">
                  {tags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => { setSelectedTag(tag); setFilter('all'); setPage(1); }}
                      className={cn(
                        'rounded-md px-2 py-0.5 text-[11px] font-medium ring-1',
                        selectedTag === tag
                          ? theme.tagActive
                          : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-100',
                      )}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Notes list — scrollable center */}
        <main
          className={cn(
            'flex min-h-0 min-w-0 flex-1 flex-col',
            editorOpen && 'hidden lg:flex',
          )}
        >
          {notesBody}
        </main>

        {/* Editor — docked right, full height */}
        {editorOpen && (
          <div className="hidden min-h-0 w-[380px] shrink-0 flex-col border-l border-slate-200 lg:flex">
            <NoteEditorModal
              embedded
              open={editorOpen}
              note={editingNote}
              onClose={() => setEditorOpen(false)}
              onSaved={handleSaved}
              onDelete={handleDelete}
              accent={theme.sheet}
            />
          </div>
        )}
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <NoteEditorModal
            open={editorOpen}
            note={editingNote}
            onClose={() => setEditorOpen(false)}
            onSaved={handleSaved}
            onDelete={handleDelete}
            accent={theme.sheet}
          />
        </div>
      )}
    </div>
  );
}
