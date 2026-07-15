'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useState } from 'react';
import {
  batchesService,
  type BatchHierarchyMember,
  type BatchHierarchyResponse,
} from '@/lib/api/batches.service';
import { BatchMemberPerformance } from '@/components/batches/BatchMemberPerformance';
import { extractApiError } from '@/lib/api/errors';
import { cn } from '@/lib/utils/cn';
import {
  ChevronDown,
  ChevronRight,
  GitBranch,
  Loader2,
  Users,
  History,
} from 'lucide-react';
import type { BatchHierarchyShareEvent } from '@/lib/api/batches.service';

function roleBadge(role: string) {
  if (role === 'db_admin') return 'DB Admin';
  if (role === 'employee') return 'Employee';
  if (role === 'admin') return 'Super Admin';
  return role;
}

function formatWhen(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function MemberRow({
  node,
  depth,
  selectedId,
  onSelect,
  defaultOpen,
}: {
  node: BatchHierarchyMember;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen ?? depth === 0);
  const hasTeam = node.team.length > 0;
  const selected = selectedId === node.user.id;

  return (
    <>
      <tr
        className={cn(
          'cursor-pointer border-b border-slate-200 text-left text-[13px]',
          selected ? 'bg-[#e8f5ee]' : 'hover:bg-[#f9f9f9]',
          depth > 0 && 'bg-slate-50/80',
        )}
        onClick={() => onSelect(node.user.id)}
      >
        <td className="w-8 border-r border-slate-100 px-2 py-2.5 text-center">
          {hasTeam ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen((v) => !v);
              }}
              className="text-slate-500"
            >
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : null}
        </td>
        <td className="border-r border-slate-100 px-3 py-2.5 font-medium text-slate-800">
          <span style={{ paddingLeft: depth * 16 }}>{node.user.name}</span>
        </td>
        <td className="border-r border-slate-100 px-3 py-2.5 text-slate-500">
          {roleBadge(node.user.role)}
        </td>
        <td className="border-r border-slate-100 px-3 py-2.5 text-right font-mono text-slate-700">
          {node.dataRows.toLocaleString('en-US')}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-slate-500">
          {node.activity.updates}/{node.activity.touches}/{node.activity.views}
        </td>
      </tr>
      {hasTeam &&
        open &&
        node.team.map((t) => (
          <MemberRow
            key={t.user.id}
            node={t}
            depth={depth + 1}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}

export function BatchHierarchyPanel({
  batchId,
  className,
  defaultExpanded = true,
  standalone = false,
}: {
  batchId: string;
  className?: string;
  defaultExpanded?: boolean;
  /** Full-page team view: no collapse, cleaner chrome */
  standalone?: boolean;
}) {
  const [expanded, setExpanded] = useState(standalone || defaultExpanded);
  const [data, setData] = useState<BatchHierarchyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const h = await batchesService.getHierarchy(batchId);
      setData(h);
      const first =
        h.tree[0]?.user.id ?? h.directEmployees[0]?.user.id ?? h.tree[0]?.team[0]?.user.id;
      if (first) setSelectedId(first);
    } catch (e) {
      setError(extractApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  const selectedMember = (() => {
    if (!data || !selectedId) return null;
    for (const n of data.tree) {
      if (n.user.id === selectedId) return n;
      for (const t of n.team) if (t.user.id === selectedId) return t;
    }
    return data.directEmployees.find((e) => e.user.id === selectedId) ?? null;
  })();

  if (!standalone && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className={cn(
          'flex w-full items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50/80 px-4 py-2.5 text-sm font-medium text-indigo-800 hover:bg-indigo-50',
          className,
        )}
      >
        <GitBranch className="h-4 w-4" />
        Show team hierarchy & activity
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex min-h-0 flex-col overflow-hidden border border-slate-300 bg-white',
        standalone && 'h-full rounded-none',
        !standalone && 'rounded-lg shadow-sm border-slate-200',
        className,
      )}
    >
      {!standalone && (
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white px-4 py-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-[#2e7ad1]" />
            <div>
              <p className="text-sm font-bold text-slate-900">Data hierarchy & activity</p>
              {data && (
                <p className="text-xs text-slate-500">
                  {data.root.name}
                  {data.root.monthLabel && ` · ${data.root.monthLabel}`}
                  {' · '}
                  {data.root.rowCount.toLocaleString('en-US')} contacts total
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(false)}
            className="text-xs font-medium text-slate-500 hover:text-slate-800"
          >
            Collapse
          </button>
        </div>
      )}

      {standalone && data && !loading && !error && (
        <div className="border-b border-slate-100 bg-indigo-50/40 px-4 py-2.5">
          <p className="text-sm font-semibold text-slate-800">{data.root.name}</p>
          <p className="text-xs text-slate-500">
            {data.root.monthLabel && `${data.root.monthLabel} · `}
            {data.root.rowCount.toLocaleString('en-US')} contacts in this campaign tree
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin text-[#2e7ad1]" />
          Loading hierarchy…
        </div>
      ) : error ? (
        <p className="flex-1 px-4 py-8 text-center text-sm text-red-600">{error}</p>
      ) : !data ? null : (
        <div className="flex min-h-0 flex-1 flex-col">
          {(data.shareEvents?.length ?? 0) > 0 && (
            <div className="max-h-[200px] overflow-y-auto border-b border-slate-300 bg-[#fafafa]">
              <div className="border-b border-slate-200 bg-[#f3f3f3] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                Share history
              </div>
              <table className="w-full border-collapse text-[12px]">
                <tbody>
                  {(data.shareEvents ?? []).slice(0, 6).map((ev: BatchHierarchyShareEvent) => (
                    <tr key={ev.id} className="border-b border-slate-100 hover:bg-white">
                      <td className="px-3 py-2.5 font-medium text-slate-800">{ev.sharerName}</td>
                      <td className="px-3 py-2.5 text-slate-600">{ev.batchName}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{ev.rowCount}</td>
                      <td className="px-3 py-2.5 text-[#2568b8]">
                        {ev.recipients.map((r) => r.name).join(', ')}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-400 whitespace-nowrap">
                        {formatWhen(ev.occurredAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div
            className={cn(
              'grid min-h-[320px] grid-cols-1 border-t border-slate-300 lg:grid-cols-[minmax(280px,0.9fr)_minmax(360px,1.1fr)]',
              standalone ? 'min-h-0 flex-1' : 'max-h-[560px]',
            )}
          >
            <div className="overflow-auto border-r border-slate-300 bg-white lg:border-b-0">
              {data.tree.length === 0 && data.directEmployees.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Share this campaign to see team members here.
                </p>
              ) : (
                <table className="w-full border-collapse text-[13px]">
                  <thead className="sticky top-0 z-10 bg-[#f3f3f3] text-[11px] uppercase tracking-wide text-slate-600">
                    <tr>
                      <th className="w-8 border-b border-r border-slate-200 px-2 py-2.5" />
                      <th className="border-b border-r border-slate-200 px-3 py-2.5 text-left">
                        Name
                      </th>
                      <th className="border-b border-r border-slate-200 px-3 py-2.5 text-left">
                        Role
                      </th>
                      <th className="border-b border-r border-slate-200 px-3 py-2.5 text-right">
                        Contacts
                      </th>
                      <th className="border-b border-slate-200 px-3 py-2.5 text-right">
                        Up/Tch/Op
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.tree.map((n, i) => (
                      <MemberRow
                        key={n.user.id}
                        node={n}
                        depth={0}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                        defaultOpen={i === 0}
                      />
                    ))}
                    {data.directEmployees.map((n) => (
                      <MemberRow
                        key={n.user.id}
                        node={n}
                        depth={0}
                        selectedId={selectedId}
                        onSelect={setSelectedId}
                      />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex min-h-0 min-w-0 flex-col bg-[#e8e8e8]">
              {selectedMember && selectedId ? (
                <BatchMemberPerformance
                  batchId={batchId}
                  userId={selectedId}
                  userName={selectedMember.user.name}
                  dataRows={selectedMember.dataRows}
                />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-slate-500">
                  <Users className="mb-2 h-8 w-8 opacity-30" />
                  <p className="text-sm">Select a row to view performance & leads</p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Updates / touches / opens · productivity graph
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
