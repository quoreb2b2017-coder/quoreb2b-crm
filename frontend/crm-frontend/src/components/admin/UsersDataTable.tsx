'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';

const COL_COUNT = 11;

const COLUMNS = [
  '#',
  'Name',
  'Email',
  'Employee ID',
  'Role',
  'Status',
  'Last Login',
  'Password',
  'Activity',
  'Block',
  'Delete',
] as const;

const roleLabels: Record<string, string> = {
  admin: 'Super Admin',
  db_admin: 'DB Administrator',
  employee: 'Employee',
  super_admin: 'Super Admin',
};

const roleBadge: Record<string, string> = {
  admin: 'bg-violet-100 text-violet-800',
  db_admin: 'bg-blue-100 text-blue-800',
  employee: 'bg-emerald-100 text-emerald-800',
  super_admin: 'bg-slate-200 text-slate-700',
};

function formatDate(val: unknown): string {
  if (!val) return '—';
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE,  dateStyle: 'medium', timeStyle: 'short' });
}

interface GridCellProps {
  row: number;
  col: number;
  active: boolean;
  align?: 'left' | 'center';
  className?: string;
  sticky?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}

function GridCell({
  row,
  col,
  active,
  align = 'left',
  className,
  sticky,
  onActivate,
  children,
}: GridCellProps) {
  return (
    <td
      data-grid-row={row}
      data-grid-col={col}
      tabIndex={active ? 0 : -1}
      onFocus={onActivate}
      onClick={onActivate}
      className={cn(
        'border border-[#e0e0e0] p-0 text-[13px] text-slate-900 outline-none transition-colors cursor-default',
        align === 'center' && 'text-center',
        sticky && 'sticky left-0 z-10 bg-[#f2f2f2]',
        active && 'relative z-[1] bg-[#e7f3ff] ring-2 ring-inset ring-[#217346]',
        !active && 'hover:bg-[#e7f3ff]/50',
        className,
      )}
    >
      <div className={cn('px-2 py-1 truncate', align === 'center' && 'flex justify-center')}>
        {children}
      </div>
    </td>
  );
}

export interface UserRowMeta {
  userId: string;
  name: string;
  role: string;
  active: boolean;
  raw: Record<string, unknown>;
}

interface UsersDataTableProps {
  users: Record<string, unknown>[];
  loading: boolean;
  actionLoading: string | null;
  navigationEnabled: boolean;
  className?: string;
  onOpenPassword: (userId: string, name: string) => void;
  onOpenReport: (user: Record<string, unknown>) => void;
  onToggleBlock: (userId: string, active: boolean) => void;
  onDelete: (userId: string, name: string) => void;
}

function parseRows(users: Record<string, unknown>[]): UserRowMeta[] {
  return users.map((u) => {
    const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
    const role = roles[0] ?? '';
    return {
      userId: String(u.id ?? u._id ?? ''),
      name: `${String(u.firstName)} ${String(u.lastName)}`.trim(),
      role,
      active: u.isActive !== false,
      raw: u,
    };
  });
}

export function UsersDataTable({
  users,
  loading,
  actionLoading,
  navigationEnabled,
  className,
  onOpenPassword,
  onOpenReport,
  onToggleBlock,
  onDelete,
}: UsersDataTableProps) {
  const rows = parseRows(users);
  const isManageable = (role: string) => role === 'employee' || role === 'db_admin';
  const hasActivityReport = (role: string) => role === 'employee' || role === 'db_admin';

  const { containerRef, isActive, setCell, activeCell } = useExcelTableNavigation({
    rowCount: rows.length,
    colCount: COL_COUNT,
    enabled: navigationEnabled && !loading && rows.length > 0,
    onEnter: (pos) => {
      const row = rows[pos.row];
      if (!row) return;
      switch (pos.col) {
        case 7:
          onOpenPassword(row.userId, row.name);
          break;
        case 8:
          if (hasActivityReport(row.role)) onOpenReport(row.raw);
          break;
        case 9:
          if (isManageable(row.role)) onToggleBlock(row.userId, row.active);
          break;
        case 10:
          if (isManageable(row.role)) onDelete(row.userId, row.name);
          break;
        default:
          break;
      }
    },
  });

  return (
    <div className={cn('flex min-h-0 w-full flex-1 flex-col', className)}>
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden border-0 border-t border-[#b4b4b4] bg-[#e6e6e6]">
        {/* Excel-style title bar */}
        <div className="flex flex-shrink-0 items-center justify-between bg-[#217346] px-3 py-1.5 text-white">
          <div className="flex items-center gap-2">
            <span className="flex h-5 w-5 items-center justify-center rounded bg-white/20 text-[9px] font-bold">
              XL
            </span>
            <span className="text-xs font-semibold">Users</span>
          </div>
          <span className="text-[11px] text-white/80">
            {loading ? 'Loading…' : `${rows.length} row${rows.length !== 1 ? 's' : ''}`}
          </span>
        </div>

        <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-[#d4d4d4] bg-[#f3f3f3] px-3 py-1.5 text-xs text-slate-600">
          <span className="inline-flex items-center gap-0.5 rounded bg-slate-200/80 px-1 font-medium text-slate-600">
            ↑ ↓ ← →
          </span>
          <span>Navigate cells (Excel style)</span>
          <span className="text-slate-400">· Tab / Enter on action columns</span>
        </div>

        <div
          ref={containerRef}
          className="min-h-0 w-full flex-1 overflow-x-auto overflow-y-auto bg-white"
          onMouseDown={(e) => {
            const cell = (e.target as HTMLElement).closest('[data-grid-row]');
            if (cell) {
              const row = Number(cell.getAttribute('data-grid-row'));
              const col = Number(cell.getAttribute('data-grid-col'));
              if (!Number.isNaN(row) && !Number.isNaN(col)) setCell({ row, col });
            }
          }}
        >
          <table className="w-full border-collapse text-[13px]">
            <thead className="sticky top-0 z-20">
              <tr>
                {COLUMNS.map((label, i) => (
                  <th
                    key={label}
                    className={cn(
                      'border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800',
                      i === 0 && 'sticky left-0 z-40 w-10 text-center',
                      i >= 7 && 'text-center',
                      i === 1 && 'min-w-[150px] text-left',
                      i === 2 && 'min-w-[200px] text-left',
                      i === 6 && 'min-w-[150px] text-left',
                      i !== 0 && i < 7 && 'text-left',
                    )}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={COL_COUNT}
                    className="border border-[#e0e0e0] px-4 py-12 text-center text-sm text-slate-500"
                  >
                    <svg className="mx-auto mb-2 h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Loading users…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={COL_COUNT}
                    className="border border-[#e0e0e0] px-4 py-12 text-center text-sm text-slate-500"
                  >
                    No users found. Click &quot;Add User&quot; to create one.
                  </td>
                </tr>
              ) : (
                rows.map((row, rowIndex) => {
                  const u = row.raw;
                  const activate = (col: number) => () => setCell({ row: rowIndex, col });

                  return (
                    <tr key={row.userId} className="hover:bg-[#e7f3ff]/40">
                      <GridCell
                        row={rowIndex}
                        col={0}
                        active={isActive(rowIndex, 0)}
                        sticky
                        onActivate={activate(0)}
                        className="text-center text-[11px] text-slate-500"
                      >
                        {rowIndex + 1}
                      </GridCell>
                      <GridCell
                        row={rowIndex}
                        col={1}
                        active={isActive(rowIndex, 1)}
                        onActivate={activate(1)}
                        className="min-w-[150px] font-medium"
                      >
                        {row.name}
                      </GridCell>
                      <GridCell
                        row={rowIndex}
                        col={2}
                        active={isActive(rowIndex, 2)}
                        onActivate={activate(2)}
                        className="min-w-[200px] text-slate-700"
                      >
                        {String(u.email)}
                      </GridCell>
                      <GridCell row={rowIndex} col={3} active={isActive(rowIndex, 3)} onActivate={activate(3)}>
                        {u.employeeId ? (
                          <span className="font-mono text-xs text-slate-700">{String(u.employeeId)}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </GridCell>
                      <GridCell row={rowIndex} col={4} active={isActive(rowIndex, 4)} onActivate={activate(4)}>
                        <span
                          className={cn(
                            'inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium',
                            roleBadge[row.role] ?? 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {roleLabels[row.role] ?? row.role}
                        </span>
                      </GridCell>
                      <GridCell row={rowIndex} col={5} active={isActive(rowIndex, 5)} onActivate={activate(5)}>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            row.active ? 'text-[#217346]' : 'text-red-600',
                          )}
                        >
                          {row.active ? 'Active' : 'Blocked'}
                        </span>
                      </GridCell>
                      <GridCell
                        row={rowIndex}
                        col={6}
                        active={isActive(rowIndex, 6)}
                        onActivate={activate(6)}
                        className="min-w-[150px] text-xs text-slate-600"
                      >
                        {formatDate(u.lastLoginAt)}
                      </GridCell>
                      <GridCell
                        row={rowIndex}
                        col={7}
                        active={isActive(rowIndex, 7)}
                        onActivate={activate(7)}
                        align="center"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPassword(row.userId, row.name);
                          }}
                          title="View password (Enter)"
                          className="pointer-events-auto text-[11px] font-medium text-[#217346] hover:underline"
                        >
                          View
                        </button>
                      </GridCell>
                      <GridCell
                        row={rowIndex}
                        col={8}
                        active={isActive(rowIndex, 8)}
                        onActivate={activate(8)}
                        align="center"
                      >
                        {hasActivityReport(row.role) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenReport(row.raw);
                            }}
                            className="pointer-events-auto text-[11px] font-medium text-[#217346] hover:underline"
                          >
                            Report
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </GridCell>
                      <GridCell
                        row={rowIndex}
                        col={9}
                        active={isActive(rowIndex, 9)}
                        onActivate={activate(9)}
                        align="center"
                      >
                        {isManageable(row.role) ? (
                          <button
                            type="button"
                            disabled={actionLoading === `block-${row.userId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleBlock(row.userId, row.active);
                            }}
                            className="pointer-events-auto border border-[#ababab] bg-white px-2 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-[#fff8e6] disabled:opacity-50"
                          >
                            {row.active ? 'Block' : 'Unblock'}
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </GridCell>
                      <GridCell
                        row={rowIndex}
                        col={10}
                        active={isActive(rowIndex, 10)}
                        onActivate={activate(10)}
                        align="center"
                      >
                        {isManageable(row.role) ? (
                          <button
                            type="button"
                            disabled={actionLoading === `delete-${row.userId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(row.userId, row.name);
                            }}
                            className="pointer-events-auto border border-[#ababab] bg-white px-2 py-0.5 text-[11px] font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Delete
                          </button>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </GridCell>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
