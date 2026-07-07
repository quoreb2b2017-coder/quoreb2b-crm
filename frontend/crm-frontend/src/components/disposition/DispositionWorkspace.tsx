'use client';

import '@/components/batches/batches.css';
import '@/components/qc/qc-shared.css';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  ClipboardList,
  Folder,
  FolderOpen,
  Layers,
  PhoneOff,
  Voicemail,
  UserRound,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  dispositionService,
  type DispositionEntry,
  type DispositionTreeNode,
} from '@/lib/api/disposition.service';
import { toast } from '@/stores/toast.store';
import { CALENDAR_MONTHS, currentCalendarPeriod } from '@/lib/batches/month-structure';
import { DispositionExcelSheet } from '@/components/disposition/DispositionExcelSheet';
import {
  collectDispositionEntries,
  flattenDispositionTree,
} from '@/lib/disposition/disposition-entries-to-sheet';

function isPathActive(path: string[], selectedPath: string[]): boolean {
  if (selectedPath.length < path.length) return false;
  return path.every((k, i) => selectedPath[i] === k);
}

export function DispositionWorkspace() {
  const [tree, setTree] = useState<DispositionTreeNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPath, setSelectedPath] = useState<string[]>([]);
  const [showAll, setShowAll] = useState(true);
  const [filterEmployeeId, setFilterEmployeeId] = useState<string | null>(null);
  const [year, setYear] = useState(() => currentCalendarPeriod().year);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set());
  const [showAllMonths, setShowAllMonths] = useState(true);
  const hasLoadedRef = useRef(false);

  const toggleKey = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent || !hasLoadedRef.current) setLoading(true);
    try {
      setTree(await dispositionService.getAllTree());
      hasLoadedRef.current = true;
    } catch {
      toast.error('Could not load disposition archive');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allEntries = useMemo(() => flattenDispositionTree(tree), [tree]);

  const selectedNode = useMemo(() => {
    let nodes = tree;
    let current: DispositionTreeNode | undefined;
    for (const key of selectedPath) {
      current = nodes.find((n) => n.key === key);
      nodes = current?.children ?? [];
    }
    return current ?? null;
  }, [tree, selectedPath]);

  const folderEntries = useMemo(
    () => collectDispositionEntries(selectedNode),
    [selectedNode],
  );

  const baseEntries = showAll || selectedPath.length === 0 ? allEntries : folderEntries;

  const displayEntries = useMemo(() => {
    if (!filterEmployeeId) return baseEntries;
    return baseEntries.filter((e) => e.employeeId === filterEmployeeId);
  }, [baseEntries, filterEmployeeId]);

  const employeeGroups = useMemo(() => {
    const map = new Map<
      string,
      { employeeId: string; employeeName: string; entries: DispositionEntry[] }
    >();
    for (const e of baseEntries) {
      const g = map.get(e.employeeId);
      if (g) g.entries.push(e);
      else
        map.set(e.employeeId, {
          employeeId: e.employeeId,
          employeeName: e.employeeName ?? 'Employee',
          entries: [e],
        });
    }
    return [...map.values()].sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [baseEntries]);

  const selectPath = (path: string[]) => {
    setSelectedPath(path);
    setShowAll(false);
    setFilterEmployeeId(null);
  };

  const sheetTitle = useMemo(() => {
    if (showAll || selectedPath.length === 0) {
      return 'All dispositions — Do Not Call & Direct Voicemail';
    }
    return selectedNode?.label ?? 'Disposition records';
  }, [showAll, selectedPath, selectedNode]);

  const activeKindKey = selectedPath[0] ?? tree[0]?.key ?? '';
  const activeKindNode = tree.find((n) => n.key === activeKindKey) ?? tree[0];

  const yearNodes = activeKindNode?.children ?? [];
  const years = useMemo(() => {
    const fromTree = yearNodes.map((n) => n.year ?? Number(n.label)).filter(Boolean);
    const current = currentCalendarPeriod().year;
    return [...new Set([current, ...fromTree])].sort((a, b) => b - a);
  }, [yearNodes]);

  useEffect(() => {
    if (!years.includes(year)) setYear(years[0] ?? currentCalendarPeriod().year);
  }, [years, year]);

  const yearNode = yearNodes.find((n) => n.year === year || n.label === String(year)) ?? yearNodes[0];
  const monthNodes = yearNode?.children ?? [];

  return (
    <div className="qc-workspace xl-workbook flex min-h-0 flex-1 flex-col">
      <div className="qc-workspace-titlebar xl-titlebar flex-shrink-0 py-2">
        <div className="flex items-center gap-2.5">
          <span className="qc-workspace-badge">DNC / VM</span>
          <div>
            <h1 className="text-sm font-bold leading-tight text-white">Disposition archive</h1>
            <p className="text-[10px] text-white/75">
              Do Not Call &amp; Direct Voicemail — by month, campaign &amp; employee
            </p>
          </div>
        </div>
        <span className="qc-stat-pill qc-stat-pill--titlebar">
          {allEntries.length} total records
        </span>
      </div>

      <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(168px,200px)_minmax(0,1fr)] xl:grid-cols-[minmax(188px,220px)_minmax(0,1fr)]">
        <div className="qc-pending-folders flex max-h-[min(52vh,480px)] min-h-0 flex-col border-b border-[#c6c6c6] lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="qc-folder-panel-head flex items-center justify-between gap-1 px-2 py-1">
            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-600">Folders</p>
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

          <div className="flex flex-wrap gap-1 border-b border-slate-100 px-2 py-1.5">
            {tree.map((kindNode) => {
              const Icon =
                kindNode.dispositionKind === 'direct_voicemail' ? Voicemail : PhoneOff;
              const active = activeKindKey === kindNode.key;
              return (
                <button
                  key={kindNode.key}
                  type="button"
                  onClick={() => {
                    selectPath([kindNode.key]);
                    setExpandedKeys((prev) => new Set(prev).add(kindNode.key));
                  }}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ring-1',
                    active
                      ? 'bg-violet-700 text-white ring-violet-700'
                      : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {kindNode.label}
                  <span className="rounded-full bg-black/10 px-1">{kindNode.count ?? 0}</span>
                </button>
              );
            })}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-1">
            {loading ? (
              <p className="py-6 text-center text-[11px] text-slate-400">Loading folders…</p>
            ) : tree.length === 0 ? (
              <div className="qc-empty-panel">
                <span className="qc-empty-state-icon qc-empty-state-icon--pending">
                  <ClipboardList strokeWidth={1.75} />
                </span>
                <p className="text-xs font-semibold text-slate-700">No dispositions yet</p>
                <p className="mt-1 max-w-[200px] text-[10px] leading-relaxed text-slate-500">
                  When employees pick Do Not Call or Direct Voicemail, records appear here.
                </p>
              </div>
            ) : (
              <table className="xl-table w-full qc-folder-table">
                <tbody>
                  {CALENDAR_MONTHS.map((cal) => {
                    const monthNode = monthNodes.find((n) => n.month === cal.index);
                    const campaigns = monthNode?.children ?? [];
                    const monthCount = monthNode?.count ?? 0;
                    const hasRecords = monthCount > 0;
                    if (!showAllMonths && !hasRecords) return null;

                    const kindKey = activeKindNode?.key ?? '';
                    const yearKey = yearNode?.key ?? '';
                    const monthKey = monthNode?.key ?? `m-${cal.index}`;
                    const monthPath = [kindKey, yearKey, monthKey].filter(Boolean);
                    const monthExpanded = expandedKeys.has(monthKey);

                    return (
                      <Fragment key={cal.index}>
                        <tr
                          className={cn(
                            'qc-tree-row',
                            hasRecords ? 'qc-month-row--has-files cursor-pointer' : 'qc-month-row--empty',
                            isPathActive(monthPath, selectedPath) && 'qc-tree-row--active',
                          )}
                          onClick={() => {
                            if (hasRecords) toggleKey(monthKey);
                            if (kindKey) selectPath(monthPath);
                          }}
                        >
                          <td>
                            <div className="flex items-center gap-1">
                              <ChevronRight className={cn('h-3.5 w-3.5', monthExpanded && 'rotate-90')} />
                              {hasRecords && monthExpanded ? (
                                <FolderOpen className="h-3.5 w-3.5 text-violet-600" />
                              ) : (
                                <Folder className="h-3.5 w-3.5 text-slate-400" />
                              )}
                              <span className={cn('text-[10px] font-semibold', cal.accent)}>
                                {cal.short}
                              </span>
                              <span className="xl-folder-count-pill">{monthCount}</span>
                            </div>
                          </td>
                        </tr>

                        {monthExpanded &&
                          campaigns.map((camp) => {
                            const campPath = [...monthPath, camp.key];
                            const employees = camp.children ?? [];
                            const campExpanded = expandedKeys.has(camp.key);

                            return (
                              <Fragment key={camp.key}>
                                <tr
                                  className={cn(
                                    'qc-tree-row qc-tree-row--campaign cursor-pointer',
                                    isPathActive(campPath, selectedPath) && 'qc-tree-row--active',
                                  )}
                                  onClick={() => {
                                    if (employees.length) toggleKey(camp.key);
                                    selectPath(campPath);
                                  }}
                                >
                                  <td className="!pl-4">
                                    <div className="flex min-w-0 items-center gap-1.5">
                                      {employees.length > 0 && (
                                        <ChevronRight
                                          className={cn('h-3 w-3', campExpanded && 'rotate-90')}
                                        />
                                      )}
                                      <Layers className="h-3.5 w-3.5 text-slate-500" />
                                      <span className="truncate text-[10px] font-semibold text-slate-800">
                                        {camp.label}
                                      </span>
                                      <span className="text-[9px] font-bold text-violet-700">
                                        {camp.count ?? 0}
                                      </span>
                                    </div>
                                  </td>
                                </tr>

                                {campExpanded &&
                                  employees.map((emp) => {
                                    const empPath = [...campPath, emp.key];
                                    return (
                                      <tr
                                        key={emp.key}
                                        className={cn(
                                          'qc-tree-row cursor-pointer',
                                          isPathActive(empPath, selectedPath) && 'qc-tree-row--active',
                                        )}
                                        onClick={() => selectPath(empPath)}
                                      >
                                        <td className="!pl-8">
                                          <div className="flex min-w-0 items-center gap-1">
                                            <UserRound className="h-3 w-3 text-slate-400" />
                                            <span className="truncate text-[10px] text-slate-600">
                                              {emp.label}
                                            </span>
                                            <span className="text-[9px] text-slate-400">
                                              {emp.count ?? 0}
                                            </span>
                                          </div>
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
          <div className="qc-toolbar-bar flex-shrink-0 rounded-lg px-2.5 py-1.5">
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
                  ? 'bg-[#2e7ad1] text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              Show all ({allEntries.length})
            </button>
          </div>

          {employeeGroups.length > 0 && (
            <div className="flex-shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
              <div className="flex flex-wrap gap-1">
                <button
                  type="button"
                  onClick={() => setFilterEmployeeId(null)}
                  className={cn(
                    'rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
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
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold ring-1',
                      filterEmployeeId === g.employeeId
                        ? 'bg-[#2e7ad1] text-white ring-violet-600'
                        : 'bg-violet-50 text-violet-900 ring-violet-200 hover:bg-violet-100',
                    )}
                  >
                    <UserRound className="h-3 w-3" />
                    {g.employeeName}
                    <span className="rounded-full bg-violet-200/80 px-1.5 py-0.5 text-[9px]">
                      {g.entries.length}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-hidden">
            <DispositionExcelSheet
              title={sheetTitle}
              entries={displayEntries}
              loading={loading}
              emptyMessage="Pick Do Not Call or Direct Voicemail on an assigned campaign"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
