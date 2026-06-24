'use client';

import '@/components/batches/batches.css';
import './qc-shared.css';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  ClipboardList,
  Folder,
  FolderOpen,
  Layers,
  ShieldAlert,
  Trash2,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  qcService,
  type QcEntry,
  type QcTreeNode,
} from '@/lib/api/qc.service';
import { toast } from '@/stores/toast.store';
import { CALENDAR_MONTHS, currentCalendarPeriod } from '@/lib/batches/month-structure';
import { QcExcelSheet } from '@/components/qc/QcExcelSheet';
import {
  flattenQcTree,
  groupEntriesByEmployee,
  employeeLeadSummary,
  entriesToSuppressionPayload,
} from '@/lib/qc/qc-entries-to-sheet';
import { CheckSuppressionModal } from '@/components/employee/CheckSuppressionModal';
import { CheckSuppressionResultPopup } from '@/components/employee/CheckSuppressionResultPopup';

interface QcWorkspaceProps {
  mode: 'employee' | 'admin';
}

function collectEntries(node: QcTreeNode | null): QcEntry[] {
  if (!node) return [];
  if (node.entries?.length) return node.entries;
  return (node.children ?? []).flatMap((c) => collectEntries(c));
}

function isPathActive(path: string[], selectedPath: string[]): boolean {
  if (selectedPath.length < path.length) return false;
  return path.every((k, i) => selectedPath[i] === k);
}

export function QcWorkspace({ mode }: QcWorkspaceProps) {
  const isAdmin = mode === 'admin';
  const [tree, setTree] = useState<QcTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(true);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(null);
  const [checkOpen, setCheckOpen] = useState(false);
  const [duplicateHighlightRows, setDuplicateHighlightRows] = useState<number[]>([]);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [resultOpen, setResultOpen] = useState(false);
  const [duplicateFileName, setDuplicateFileName] = useState<string | null>(null);
  const [year, setYear] = useState(() => currentCalendarPeriod().year);
  const [expandedMonths, setExpandedMonths] = useState<Set<number>>(() => new Set());
  const [expandedCampaigns, setExpandedCampaigns] = useState<Set<string>>(() => new Set());
  const [showAllMonths, setShowAllMonths] = useState(false);
  const [clearingQc, setClearingQc] = useState(false);

  const toggleMonth = useCallback((monthIndex: number) => {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthIndex)) next.delete(monthIndex);
      else next.add(monthIndex);
      return next;
    });
  }, []);

  const toggleCampaign = useCallback((campKey: string) => {
    setExpandedCampaigns((prev) => {
      const next = new Set(prev);
      if (next.has(campKey)) next.delete(campKey);
      else next.add(campKey);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTree(isAdmin ? await qcService.getAllTree() : await qcService.getMyTree());
    } catch {
      toast.error('Could not load QC data');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  const years = useMemo(() => {
    const fromTree = tree.map((n) => n.year ?? Number(n.label)).filter(Boolean);
    const current = currentCalendarPeriod().year;
    return [...new Set([current, ...fromTree])].sort((a, b) => b - a);
  }, [tree]);

  useEffect(() => {
    if (!years.includes(year)) setYear(years[0] ?? currentCalendarPeriod().year);
  }, [years, year]);

  useEffect(() => {
    setExpandedMonths(new Set());
    setExpandedCampaigns(new Set());
  }, [year]);

  const yearNode = useMemo(
    () => tree.find((n) => n.year === year || n.label === String(year)) ?? tree[0],
    [tree, year],
  );

  const monthNodes = useMemo(() => yearNode?.children ?? [], [yearNode]);

  const allEntries = useMemo(() => flattenQcTree(tree), [tree]);

  const selectedNode = useMemo(() => {
    let nodes = tree;
    let current: QcTreeNode | undefined;
    for (const key of selectedPath) {
      current = nodes.find((n) => n.key === key);
      nodes = current?.children ?? [];
    }
    return current ?? null;
  }, [tree, selectedPath]);

  const folderEntries = useMemo(() => collectEntries(selectedNode), [selectedNode]);

  const baseEntries =
    showAll || selectedPath.length === 0 ? allEntries : folderEntries;

  const displayEntries = useMemo(() => {
    if (!filterEmployeeId) return baseEntries;
    return baseEntries.filter((e) => e.employeeId === filterEmployeeId);
  }, [baseEntries, filterEmployeeId]);

  const employeeGroups = useMemo(
    () => (isAdmin ? groupEntriesByEmployee(baseEntries) : []),
    [isAdmin, baseEntries],
  );

  const pendingEntries = useMemo(
    () => displayEntries.filter((e) => e.state === 'pending' && !e.returnedToEmployee),
    [displayEntries],
  );

  const reviewableCount = useMemo(
    () => allEntries.filter((e) => e.state === 'pending' && !e.returnedToEmployee).length,
    [allEntries],
  );

  const mergedCount = useMemo(
    () => allEntries.filter((e) => e.state === 'merged').length,
    [allEntries],
  );

  const selectPath = (path: string[]) => {
    setSelectedPath(path);
    setShowAll(false);
    setFilterEmployeeId(null);
    setDuplicateHighlightRows([]);
  };

  const mergeBreakdown = useMemo(
    () => employeeLeadSummary(groupEntriesByEmployee(pendingEntries)),
    [pendingEntries],
  );

  const sheetTitle = useMemo(() => {
    if (showAll || selectedPath.length === 0) {
      return isAdmin ? 'All QC — all marked leads' : 'My QC — all marked leads';
    }
    return selectedNode?.label ?? 'QC leads';
  }, [showAll, selectedPath, selectedNode, isAdmin]);

  const pendingCount = reviewableCount;

  const suppressionPayload = useMemo(
    () => entriesToSuppressionPayload(displayEntries),
    [displayEntries],
  );

  const duplicateIdsForView = useMemo(() => {
    const dupIds = new Set(
      duplicateHighlightRows
        .map((i) => displayEntries[i]?.id)
        .filter(Boolean) as string[],
    );
    return dupIds;
  }, [duplicateHighlightRows, displayEntries]);

  const duplicateIndicesForSheet = useCallback(
    (sheetEntries: QcEntry[]) =>
      sheetEntries
        .map((e, idx) => (duplicateIdsForView.has(e.id) ? idx : -1))
        .filter((idx) => idx >= 0),
    [duplicateIdsForView],
  );

  const handleClearQc = async () => {
    if (
      !confirm(
        'Delete all QC data?\n\nThis removes every pending lead in All QC and every file in Ready QC. User logins are not affected.',
      )
    ) {
      return;
    }
    setClearingQc(true);
    try {
      const result = await qcService.clearAll();
      toast.success(
        'QC cleared',
        `${result.deletedEntries} queue entries · ${result.deletedReadyBatches} Ready QC file(s) removed`,
      );
      setSelectedPath([]);
      setShowAll(true);
      setFilterEmployeeId(null);
      void load();
    } catch {
      toast.error('Could not clear QC data');
    } finally {
      setClearingQc(false);
    }
  };

  const excelToolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          setShowAll(true);
          setSelectedPath([]);
          setFilterEmployeeId(null);
        }}
        className={cn(
          'rounded-md px-2.5 py-1 text-xs font-bold shadow-sm transition-colors',
          showAll || selectedPath.length === 0
            ? 'bg-[#217346] text-white'
            : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
        )}
      >
        Show all ({allEntries.length})
      </button>
      {isAdmin && displayEntries.length > 0 && (
        <button
          type="button"
          onClick={() => setCheckOpen(true)}
          className="inline-flex items-center gap-1 rounded-md bg-[#217346] px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-[#1a5c38]"
        >
          <ShieldAlert className="h-3.5 w-3.5" />
          Check suppression
        </button>
      )}
      {isAdmin && (
        <span className="text-[11px] font-medium text-slate-600">
          Click row → Qualified / TBD / Disqualified
        </span>
      )}
      {mergedCount > 0 && (
        <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
          {mergedCount} merged
        </span>
      )}
      {pendingCount > 0 && (
        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
          {pendingCount} pending
        </span>
      )}
      {isAdmin && mergeBreakdown && (
        <span className="text-[11px] font-medium text-slate-600">{mergeBreakdown}</span>
      )}
    </div>
  );

  return (
    <div className="qc-workspace xl-workbook flex min-h-0 flex-1 flex-col">
      <div className="qc-workspace-titlebar xl-titlebar flex-shrink-0 py-2">
        <div className="flex items-center gap-2.5">
          <span className="qc-workspace-badge">QC</span>
          <div>
            <h1 className="text-sm font-bold leading-tight text-white">
              {isAdmin ? 'All QC' : 'My QC'}
            </h1>
            <p className="text-[10px] text-white/75">
              {isAdmin
                ? 'Review leads · click row for QC Status · Qualified → Ready QC'
                : 'Your leads — TBD / Disqualified from admin appear here'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="qc-stat-pill !border-white/30 !bg-white/15 !text-white">
            {allEntries.length} total · {pendingCount} pending
          </span>
          {isAdmin && (
            <>
              <button
                type="button"
                disabled={clearingQc}
                onClick={() => void handleClearQc()}
                className="inline-flex items-center gap-1 rounded-md border border-red-300/60 bg-red-500/20 px-2 py-1 text-[11px] font-bold text-white hover:bg-red-500/35 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {clearingQc ? 'Clearing…' : 'Clear QC'}
              </button>
              <Link href="/admin/qc/ready" className="qc-link-ready !border-white/40 !bg-white/15 !text-white">
                Ready QC
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(168px,200px)_minmax(0,1fr)] xl:grid-cols-[minmax(188px,220px)_minmax(0,1fr)]">
        <div className="qc-pending-folders flex max-h-[min(52vh,480px)] min-h-0 flex-col border-b border-[#c6c6c6] lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="qc-folder-panel-head flex items-center justify-between gap-1 px-2 py-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">
              Folders
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowAllMonths((v) => !v)}
                className="rounded px-1.5 py-0.5 text-[9px] font-semibold text-violet-700 hover:bg-violet-50"
              >
                {showAllMonths ? 'Active only' : 'All months'}
              </button>
              {years.length > 1 && (
                <select
                  value={year}
                  onChange={(e) => setYear(Number(e.target.value))}
                  className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[9px] font-bold text-slate-700"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1">
            {loading ? (
              <p className="py-6 text-center text-[11px] text-slate-400">Loading folders…</p>
            ) : tree.length === 0 ? (
              <div className="qc-empty-panel">
                <span className="qc-empty-state-icon qc-empty-state-icon--pending">
                  <ClipboardList strokeWidth={1.75} />
                </span>
                <p className="text-xs font-semibold text-slate-700">No pending QC yet</p>
                <p className="mt-1 max-w-[200px] text-[10px] leading-relaxed text-slate-500">
                  When employees mark Lead / Won / Active, campaigns appear here by month.
                </p>
              </div>
            ) : (
              <table className="xl-table w-full qc-folder-table">
                <thead>
                  <tr>
                    <th className="qc-folder-th-num hidden sm:table-cell">#</th>
                    <th>Month</th>
                    <th className="w-8 text-right">#</th>
                  </tr>
                </thead>
                <tbody>
                  {CALENDAR_MONTHS.map((cal, mi) => {
                    const monthNode =
                      monthNodes.find((n) => n.month === cal.index) ?? monthNodes[mi];
                    const campaigns = monthNode?.children ?? [];
                    const monthCount = monthNode?.count ?? 0;
                    const hasLeads = monthCount > 0;
                    if (!showAllMonths && !hasLeads) return null;
                    const yearKey = yearNode?.key ?? '';
                    const monthKey = monthNode?.key ?? `m-${cal.index}`;
                    const monthPath = yearKey ? [yearKey, monthKey] : [monthKey];
                    const monthExpanded = expandedMonths.has(cal.index);

                    return (
                      <Fragment key={cal.index}>
                        <tr
                          className={cn(
                            'xl-table-row--folder qc-tree-row',
                            hasLeads ? 'qc-month-row--has-files cursor-pointer' : 'qc-month-row--empty',
                            isPathActive(monthPath, selectedPath) && 'qc-tree-row--active',
                          )}
                          onClick={() => {
                            if (hasLeads) toggleMonth(cal.index);
                            selectPath(monthPath);
                          }}
                        >
                          <td className="xl-row-num hidden sm:table-cell">{cal.index}</td>
                          <td>
                            <div className="flex items-center gap-1">
                              <span
                                className={cn(
                                  'qc-month-chevron',
                                  !hasLeads && 'qc-month-chevron--muted',
                                )}
                              >
                                <ChevronRight className={cn(monthExpanded && 'rotate-90')} />
                              </span>
                              <span
                                className={cn(
                                  'qc-month-icon',
                                  hasLeads && monthExpanded
                                    ? 'qc-month-icon--open'
                                    : 'qc-month-icon--empty',
                                )}
                              >
                                {hasLeads && monthExpanded ? (
                                  <FolderOpen strokeWidth={2.25} />
                                ) : (
                                  <Folder strokeWidth={2.25} />
                                )}
                              </span>
                              <span
                                className={cn(
                                  'qc-month-label',
                                  hasLeads ? cal.accent : 'text-slate-500',
                                )}
                              >
                                {cal.short}
                              </span>
                              <span
                                className={cn(
                                  'xl-folder-count-pill',
                                  hasLeads ? 'qc-count-pill--active' : 'qc-count-pill--zero',
                                )}
                              >
                                {monthCount}
                              </span>
                            </div>
                          </td>
                          <td />
                        </tr>

                        {monthExpanded &&
                          campaigns.map((camp, ci) => {
                          const campPath = [...monthPath, camp.key];
                          const employees = camp.children ?? [];
                          const campActive = isPathActive(campPath, selectedPath);
                          const campExpanded = expandedCampaigns.has(camp.key);
                          const hasEmployees = isAdmin && employees.length > 0;

                          return (
                            <Fragment key={camp.key}>
                              <tr
                                className={cn(
                                  'qc-tree-row qc-tree-row--campaign cursor-pointer',
                                  campActive && 'qc-tree-row--active',
                                )}
                                onClick={() => {
                                  if (hasEmployees) toggleCampaign(camp.key);
                                  selectPath(campPath);
                                }}
                              >
                                <td className="xl-row-num">{`${cal.index}.${ci + 1}`}</td>
                                <td className="!pl-4">
                                  <div className="flex min-w-0 items-center gap-2">
                                    {hasEmployees ? (
                                      <span className="qc-month-chevron !h-4 !w-4">
                                        <ChevronRight
                                          className={cn('!h-3 !w-3', campExpanded && 'rotate-90')}
                                        />
                                      </span>
                                    ) : (
                                      <span className="inline-block w-4" />
                                    )}
                                    <span className="qc-campaign-icon" aria-hidden>
                                      <Layers strokeWidth={2.25} />
                                    </span>
                                    <span
                                      className="truncate text-[11px] font-semibold text-slate-800"
                                      title={camp.label}
                                    >
                                      {camp.label}
                                    </span>
                                  </div>
                                </td>
                                <td className="text-right xl-cell-mono text-[10px] font-bold text-violet-700">
                                  {camp.count ?? 0}
                                </td>
                              </tr>

                              {hasEmployees &&
                                campExpanded &&
                                employees.map((emp, ei) => {
                                  const empPath = [...campPath, emp.key];
                                  const empActive = isPathActive(empPath, selectedPath);
                                  return (
                                    <tr
                                      key={emp.key}
                                      className={cn(
                                        'qc-tree-row',
                                        empActive && 'qc-tree-row--active',
                                      )}
                                      onClick={() => selectPath(empPath)}
                                    >
                                      <td className="xl-row-num text-slate-400">
                                        {`${cal.index}.${ci + 1}.${ei + 1}`}
                                      </td>
                                      <td className="!pl-8">
                                        <div className="flex min-w-0 items-center gap-1.5">
                                          <span className="qc-employee-icon" aria-hidden>
                                            <UserRound strokeWidth={2.25} />
                                          </span>
                                          <span className="truncate text-[10px] font-medium text-slate-600">
                                            {emp.label}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="text-right xl-cell-mono text-[10px] text-slate-500">
                                        {emp.count ?? 0}
                                      </td>
                                    </tr>
                                  );
                                })}
                            </Fragment>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-1.5 lg:p-2">
          {isAdmin && (
            <div className="qc-toolbar-bar flex-shrink-0 rounded-lg px-2.5 py-1.5">
              {excelToolbar}
            </div>
          )}

          {isAdmin && employeeGroups.length > 0 && (
            <div className="flex-shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setFilterEmployeeId(null)}
                  className={cn(
                    'qc-employee-chip rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                    !filterEmployeeId
                      ? 'bg-slate-900 text-white ring-slate-900'
                      : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  All · {baseEntries.length}
                </button>
                {employeeGroups.map((g) => (
                  <button
                    key={g.employeeId}
                    type="button"
                    onClick={() => setFilterEmployeeId(g.employeeId)}
                    className={cn(
                      'qc-employee-chip inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                      filterEmployeeId === g.employeeId
                        ? 'bg-violet-600 text-white ring-violet-600'
                        : 'bg-violet-50 text-violet-900 ring-violet-200 hover:bg-violet-100',
                    )}
                  >
                    <UserRound className="h-3 w-3" />
                    {g.employeeName}
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[9px]',
                        filterEmployeeId === g.employeeId
                          ? 'bg-white/20 text-white'
                          : 'bg-violet-200/80 text-violet-900',
                      )}
                    >
                      {g.entries.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <QcExcelSheet
              title={sheetTitle}
              entries={displayEntries}
              isAdmin={isAdmin}
              loading={loading}
              toolbar={!isAdmin ? excelToolbar : undefined}
              duplicateRowIndices={duplicateIndicesForSheet(displayEntries)}
              onDecisionApplied={() => void load()}
              emptyMessage="Mark a lead as Lead / Won / Active on assigned campaign"
            />
          </div>
        </div>
      </div>

      {isAdmin && (
        <>
          <CheckSuppressionModal
            open={checkOpen}
            onClose={() => setCheckOpen(false)}
            defaultSourceKind="batch"
            baseFileName={sheetTitle}
            inlineSource={
              displayEntries.length > 0
                ? { headers: suppressionPayload.headers, rows: suppressionPayload.rows }
                : undefined
            }
            onComplete={(result) => {
              if (result.duplicateCount < 0) {
                toast.error('Suppression check failed', result.duplicateFileName ?? 'Unknown error');
                return;
              }
              setDuplicateCount(result.duplicateCount);
              setDuplicateHighlightRows(result.duplicateSourceIndices ?? []);
              setDuplicateFileName(result.duplicateFileName);
              setResultOpen(true);
            }}
          />
          <CheckSuppressionResultPopup
            open={resultOpen}
            duplicateCount={duplicateCount}
            duplicateFileName={duplicateFileName}
            highlightOnSheet
            onDone={() => setResultOpen(false)}
          />
        </>
      )}
    </div>
  );
}
