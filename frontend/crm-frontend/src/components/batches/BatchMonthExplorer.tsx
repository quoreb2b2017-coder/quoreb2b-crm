'use client';

import './batches.css';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useMemo, useState, Fragment } from 'react';
import { ChevronRight, FileSpreadsheet, Folder, FolderOpen, UserRound } from 'lucide-react';
import type { BatchRecord } from '@/lib/api/batches.service';
import {
  CALENDAR_MONTHS,
  buildLibraryYears,
  currentCalendarPeriod,
  loadSavedLibraryYears,
  persistSavedLibraryYears,
  pickDefaultMonth,
} from '@/lib/batches/month-structure';
import {
  buildCampaignFolders,
  countCampaignFoldersInYear,
  folderKey,
  groupCampaignFoldersByMonth,
  isShareSliceDescription,
  sliceAssigneeName,
  type CampaignFolder,
} from '@/lib/batches/batch-tree';
import { BatchYearToolbar } from '@/components/batches/BatchYearToolbar';
import { cn } from '@/lib/utils/cn';

function formatDate(val?: string) {
  if (!val) return '—';
  return new Date(val).toLocaleString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export interface BatchMonthExplorerProps {
  batches: BatchRecord[];
  loading?: boolean;
  title?: string;
  subtitle?: string;
  emptyTitle?: string;
  emptyHint?: string;
  /** Open campaign sheet (month folder → campaign file) */
  onOpenBatch?: (batch: BatchRecord) => void;
  renderActions: (batch: BatchRecord) => React.ReactNode;
  headerExtra?: React.ReactNode;
}

export function BatchMonthExplorer({
  batches,
  loading = false,
  title = 'All campaigns',
  subtitle = 'January–December folders · new campaigns auto-file by creation month',
  emptyTitle = 'No campaigns yet',
  emptyHint = 'Create a campaign from Master Data to see it in the matching month folder',
  onOpenBatch,
  renderActions,
  headerExtra,
}: BatchMonthExplorerProps) {
  const [savedYears, setSavedYears] = useState<number[]>([]);

  useEffect(() => {
    setSavedYears(loadSavedLibraryYears());
  }, []);

  const campaignFolders = useMemo(() => buildCampaignFolders(batches), [batches]);
  const years = useMemo(() => buildLibraryYears(batches, savedYears), [batches, savedYears]);
  const [year, setYear] = useState(() => currentCalendarPeriod().year);
  const byMonth = useMemo(
    () => groupCampaignFoldersByMonth(campaignFolders, year),
    [campaignFolders, year],
  );
  const [selectedMonth, setSelectedMonth] = useState(() =>
    pickDefaultMonth(
      groupCampaignFoldersByMonth(campaignFolders, currentCalendarPeriod().year),
      currentCalendarPeriod().year,
    ),
  );
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => new Set());
  const [openCampaignPath, setOpenCampaignPath] = useState<string | null>(null);

  const toggleFolder = useCallback((key: string, folderName: string) => {
    setExpandedFolders((prev) => {
      const opening = !prev.has(key);
      const next = new Set(prev);
      if (opening) next.add(key);
      else next.delete(key);
      setOpenCampaignPath(opening ? `/${folderName}` : null);
      return next;
    });
  }, []);

  const addYear = (y: number) => {
    if (years.includes(y)) return false;
    const next = [...savedYears, y].sort((a, b) => b - a);
    setSavedYears(next);
    persistSavedLibraryYears(next);
    return true;
  };

  useEffect(() => {
    if (!years.length) return;
    const { year: currentYear } = currentCalendarPeriod();
    if (!years.includes(year)) {
      setYear(years.includes(currentYear) ? currentYear : years[0]);
    }
  }, [years, year]);

  useEffect(() => {
    setSelectedMonth(pickDefaultMonth(byMonth, year));
  }, [year, byMonth]);

  const focusCalendarPeriod = useCallback((month: number, y: number) => {
    setYear(y);
    setSelectedMonth(month);
  }, []);

  useEffect(() => {
    const onBatchCreated = (e: Event) => {
      const detail = (e as CustomEvent<{ batchMonth?: number; batchYear?: number }>).detail;
      const { month, year: y } = currentCalendarPeriod();
      focusCalendarPeriod(detail?.batchMonth ?? month, detail?.batchYear ?? y);
    };
    const onLibraryUpdated = () => {
      const { month, year: y } = currentCalendarPeriod();
      focusCalendarPeriod(month, y);
    };
    window.addEventListener('batch-created', onBatchCreated);
    window.addEventListener('master-data-updated', onLibraryUpdated);
    return () => {
      window.removeEventListener('batch-created', onBatchCreated);
      window.removeEventListener('master-data-updated', onLibraryUpdated);
    };
  }, [focusCalendarPeriod]);

  const renderBatchRow = (
    b: BatchRecord,
    rowNum: number | string,
    opts: { child?: boolean } = {},
  ) => {
    const displayName = opts.child ? sliceAssigneeName(b) : b.name;

    return (
    <tr key={b.id} className={cn(opts.child && 'xl-table-row--child')}>
      <td className="xl-row-num">{rowNum}</td>
      <td>
        <div className={cn('flex items-center gap-2', opts.child && 'xl-child-indent')}>
          {opts.child ? (
            <span className="xl-slice-icon" aria-hidden>
              <UserRound className="h-3.5 w-3.5" />
            </span>
          ) : null}
          <div className="min-w-0">
            {onOpenBatch ? (
              <button
                type="button"
                onClick={() => onOpenBatch(b)}
                className={cn(
                  'text-left transition-colors hover:text-[#2e7ad1] hover:underline',
                  opts.child ? 'xl-slice-name' : 'xl-cell-name',
                )}
                title={opts.child ? b.name : `Open ${b.name}`}
              >
                {displayName}
              </button>
            ) : (
              <p className={opts.child ? 'xl-slice-name' : 'xl-cell-name'}>{displayName}</p>
            )}
            {opts.child ? (
              <p className="xl-slice-sub">Team slice</p>
            ) : (
              b.description &&
              !isShareSliceDescription(b.description) && (
                <p className="mt-0.5 text-[10px] leading-snug text-slate-500">{b.description}</p>
              )
            )}
          </div>
        </div>
      </td>
      <td className="text-right xl-cell-mono">{b.rowCount.toLocaleString('en-US')}</td>
      <td className="max-w-[160px] truncate text-slate-600">{b.sourceFileName ?? '—'}</td>
      <td className="whitespace-nowrap text-slate-500">{formatDate(b.createdAt)}</td>
      <td>
        <div className="flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
          {renderActions(b)}
        </div>
      </td>
    </tr>
  );
  };

  const renderFolderToggle = (
    key: string,
    name: string,
    expanded: boolean,
    childCount: number,
  ) => (
    <button
      type="button"
      onClick={() => toggleFolder(key, name)}
      className="xl-folder-toggle"
      aria-expanded={expanded}
      aria-label={expanded ? `Collapse ${name}` : `Expand ${name}`}
    >
      <span className="xl-folder-chevron" data-expanded={expanded ? 'true' : 'false'}>
        <ChevronRight className="h-3.5 w-3.5" />
      </span>
      {expanded ? (
        <FolderOpen className="h-4 w-4 shrink-0 text-[#2e7ad1]" />
      ) : (
        <Folder className="h-4 w-4 shrink-0 text-[#2e7ad1]" />
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="flex flex-wrap items-center gap-2">
          <span className="xl-cell-name font-semibold text-[#2568b8]">{name}</span>
          <span className="xl-folder-count-pill">
            {childCount} slice{childCount !== 1 ? 's' : ''}
          </span>
        </span>
      </span>
    </button>
  );

  const renderFolder = (folder: CampaignFolder, index: number) => {
    const key = folderKey(folder);
    const hasChildren = folder.children.length > 0;
    const expanded = expandedFolders.has(key);

    if (folder.kind === 'orphan-group') {
      return (
        <Fragment key={key}>
          <tr className="xl-table-row--folder">
            <td className="xl-row-num">{index + 1}</td>
            <td colSpan={4} className="!p-2">
              {renderFolderToggle(key, folder.parentName, expanded, folder.children.length)}
            </td>
            <td className="text-center">
              <span className="xl-folder-label">Folder</span>
            </td>
          </tr>
          {expanded &&
            folder.children.map((child, ci) =>
              renderBatchRow(child, `${index + 1}.${ci + 1}`, { child: true }),
            )}
        </Fragment>
      );
    }

    const parent = folder.batch;
    return (
      <Fragment key={key}>
        <tr className={cn(hasChildren && 'xl-table-row--folder')}>
          <td className="xl-row-num">
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggleFolder(key, parent.name)}
                className="xl-folder-chevron-btn mx-auto"
                aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
              >
                <span className="xl-folder-chevron" data-expanded={expanded ? 'true' : 'false'}>
                  <ChevronRight className="h-3.5 w-3.5 text-[#2e7ad1]" />
                </span>
              </button>
            ) : (
              index + 1
            )}
          </td>
          <td>
            {hasChildren ? (
              <div className="xl-folder-head">
                <button
                  type="button"
                  onClick={() => toggleFolder(key, parent.name)}
                  className="xl-folder-icon-btn"
                  aria-label={expanded ? 'Collapse folder' : 'Expand folder'}
                >
                  {expanded ? (
                    <FolderOpen className="h-4 w-4 text-[#2e7ad1]" />
                  ) : (
                    <Folder className="h-4 w-4 text-[#2e7ad1]" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {onOpenBatch ? (
                      <button
                        type="button"
                        onClick={() => onOpenBatch(parent)}
                        className="xl-folder-name"
                        title={`Open ${parent.name}`}
                      >
                        {parent.name}
                      </button>
                    ) : (
                      <span className="xl-folder-name">{parent.name}</span>
                    )}
                    <span className="xl-folder-count-pill">
                      {folder.children.length} slice{folder.children.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="min-w-0">
                {onOpenBatch ? (
                  <button
                    type="button"
                    onClick={() => onOpenBatch(parent)}
                    className="xl-cell-name text-left transition-colors hover:text-[#2e7ad1] hover:underline"
                    title={`Open ${parent.name}`}
                  >
                    {parent.name}
                  </button>
                ) : (
                  <p className="xl-cell-name">{parent.name}</p>
                )}
                {parent.description && !isShareSliceDescription(parent.description) && (
                  <p className="mt-0.5 text-[10px] text-slate-500">{parent.description}</p>
                )}
              </div>
            )}
          </td>
          <td className="text-right xl-cell-mono">{parent.rowCount.toLocaleString('en-US')}</td>
          <td className="max-w-[160px] truncate text-slate-600">{parent.sourceFileName ?? '—'}</td>
          <td className="whitespace-nowrap text-slate-500">{formatDate(parent.createdAt)}</td>
          <td>
            <div className="flex flex-nowrap items-center justify-center gap-1 whitespace-nowrap">
              {renderActions(parent)}
            </div>
          </td>
        </tr>
        {expanded &&
          hasChildren &&
          folder.children.map((child, ci) =>
            renderBatchRow(child, `${index + 1}.${ci + 1}`, { child: true }),
          )}
      </Fragment>
    );
  };

  const monthMeta = CALENDAR_MONTHS.find((m) => m.index === selectedMonth)!;
  const monthFolders = byMonth.get(selectedMonth) ?? [];
  const totalInYear = countCampaignFoldersInYear(campaignFolders, year);
  const folderPath = openCampaignPath
    ? `/campaigns/${year}/${String(selectedMonth).padStart(2, '0')}-${monthMeta.label.toLowerCase()}${openCampaignPath}`
    : `/campaigns/${year}/${String(selectedMonth).padStart(2, '0')}-${monthMeta.label.toLowerCase()}`;

  if (loading) {
    return (
      <div className="xl-loading">
        <div className="xl-loading-ring" aria-hidden />
        Loading campaign library…
      </div>
    );
  }

  return (
    <div className="xl-workbook">
      <div className="xl-titlebar">
        <div className="relative z-[1] flex min-w-0 items-center gap-3">
          <div className="xl-badge">XL</div>
          <div className="min-w-0">
            <h1 className="xl-titlebar-title truncate">{title}</h1>
            <p className="xl-titlebar-sub truncate">{subtitle}</p>
          </div>
        </div>
        <div className="relative z-[1] flex flex-wrap items-center gap-2">
          {headerExtra}
          <BatchYearToolbar
            year={year}
            years={years}
            totalInYear={totalInYear}
            onYearChange={setYear}
            onAddYear={addYear}
          />
        </div>
      </div>

      <div className="xl-pathbar">
        <span className="xl-pathbar-label">Path</span>
        <span className="xl-pathbar-value">{folderPath}</span>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="xl-sidebar">
          <div className="xl-sidebar-head">{year} · Jan–Dec (12 folders)</div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-xs">
              <thead className="sticky top-0 bg-[#fafafa]">
                <tr className="border-b border-slate-200 text-[10px] uppercase text-slate-500">
                  <th className="w-6 border-r border-slate-200 px-1 py-1" />
                  <th className="border-r border-slate-200 px-2 py-1 text-left">Month</th>
                  <th className="px-2 py-1 text-right">#</th>
                </tr>
              </thead>
              <tbody>
                {CALENDAR_MONTHS.map((m) => {
                  const count = byMonth.get(m.index)?.length ?? 0;
                  const active = selectedMonth === m.index;
                  return (
                    <tr
                      key={m.index}
                      onClick={() => setSelectedMonth(m.index)}
                      className={cn('xl-folder-row', active && 'xl-folder-row--active')}
                    >
                      <td className="border-r border-slate-100 px-1 py-1.5 text-center">
                        <Folder
                          className={cn(
                            'mx-auto h-3.5 w-3.5 transition-colors',
                            active ? 'text-[#2e7ad1]' : 'text-slate-400',
                          )}
                        />
                      </td>
                      <td
                        className={cn(
                          'border-r border-slate-100 px-2 py-1.5 font-medium',
                          active ? 'text-[#2e7ad1]' : 'text-slate-700',
                        )}
                      >
                        {m.label}
                      </td>
                      <td
                        className={cn(
                          'px-2 py-1.5 text-right font-mono',
                          count > 0 ? 'text-slate-800' : 'text-slate-300',
                        )}
                      >
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </aside>

        <section className="xl-sheet-panel">
          <div className="xl-sheet-head">
            <div className="flex items-center gap-2">
              <ChevronRight className="h-3.5 w-3.5 text-[#2e7ad1]" />
              <span className="xl-sheet-head-title">
                {monthMeta.label} {year}
              </span>
              <span className="text-[11px] text-slate-600">
                · {monthFolders.length} campaign folder{monthFolders.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {monthFolders.length === 0 ? (
            <div className="xl-empty">
              <div className="xl-empty-icon">
                <FileSpreadsheet className="h-5 w-5 text-[#2e7ad1]" />
              </div>
              {batches.length === 0 ? (
                <>
                  <p className="text-sm font-semibold text-slate-700">{emptyTitle}</p>
                  <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-500">{emptyHint}</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-slate-700">
                    No campaigns in {monthMeta.label} {year}
                  </p>
                  <p className="mt-1 text-xs text-slate-400">
                    Campaigns created in this month are filed here automatically
                  </p>
                </>
              )}
            </div>
          ) : (
            <div className="xl-table-wrap">
              <table className="xl-table">
                <thead>
                  <tr>
                    <th className="w-10 text-center">#</th>
                    <th className="text-left">Campaign name</th>
                    <th className="w-20 text-right">Contacts</th>
                    <th className="text-left">Source file</th>
                    <th className="w-36 text-left">Created</th>
                    <th className="min-w-[280px] text-center whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {monthFolders.map((folder, i) => renderFolder(folder, i))}
                </tbody>
              </table>
            </div>
          )}

          <div className="xl-tabs">
            <span className="xl-tab xl-tab--active">
              {monthMeta.short} {year}
            </span>
            {CALENDAR_MONTHS.filter(
              (m) => (byMonth.get(m.index)?.length ?? 0) > 0 && m.index !== selectedMonth,
            ).map((m) => (
              <button
                key={m.index}
                type="button"
                onClick={() => setSelectedMonth(m.index)}
                className="xl-tab"
              >
                {m.short}
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
