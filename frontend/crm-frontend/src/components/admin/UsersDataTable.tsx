'use client';

import { RefreshCw } from 'lucide-react';
import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { cn } from '@/lib/utils/cn';
import { useExcelTableNavigation } from '@/hooks/useExcelTableNavigation';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { ExcelGridCell } from '@/components/attendance/ExcelGridCell';
import { xlScrollClass } from '@/lib/attendance/xl-sheet-theme';

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
  admin: 'bg-violet-100 text-[#2568b8]',
  db_admin: 'bg-blue-100 text-blue-800',
  employee: 'bg-emerald-100 text-[#2568b8]',
  super_admin: 'bg-slate-200 text-slate-700',
};

const STATUS_STYLES = {
  active: 'bg-[#e2efda] text-[#2e7ad1] font-semibold',
  blocked: 'bg-[#fce4d6] text-[#c00000] font-semibold',
};

function formatDate(val: unknown): string {
  if (!val) return '—';
  const d = new Date(val as string);
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-US', {
        timeZone: WORKSPACE_TIMEZONE,
        dateStyle: 'medium',
        timeStyle: 'short',
      });
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

function primaryRole(roles: string[]): string {
  if (roles.includes('super_admin')) return 'super_admin';
  if (roles.includes('admin')) return 'admin';
  if (roles.includes('db_admin')) return 'db_admin';
  if (roles.includes('employee')) return 'employee';
  return roles[0] ?? '';
}

function parseRows(users: Record<string, unknown>[]): UserRowMeta[] {
  return users.map((u) => {
    const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
    const role = primaryRole(roles);
    return {
      userId: String(u.id ?? u._id ?? ''),
      name: `${String(u.firstName)} ${String(u.lastName)}`.trim(),
      role,
      active: u.isActive !== false,
      raw: u,
    };
  });
}

function GridCell(props: {
  row: number;
  col: number;
  active: boolean;
  align?: 'left' | 'center';
  className?: string;
  sticky?: boolean;
  onActivate: () => void;
  children: React.ReactNode;
}) {
  return <ExcelGridCell {...props} />;
}

function XlActionButton({
  active,
  children,
  onClick,
  disabled,
  variant = 'default',
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  variant?: 'default' | 'warn' | 'danger';
}) {
  const variantClass = {
    default: 'text-[#2e7ad1] hover:bg-[#e2efda]',
    warn: 'text-amber-900 hover:bg-[#fff8e6]',
    danger: 'text-red-700 hover:bg-red-50',
  }[variant];

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'pointer-events-auto rounded-sm border px-2 py-0.5 text-[11px] font-semibold transition-all duration-150',
        'border-[#ababab] bg-white disabled:opacity-50',
        variantClass,
        active && 'ring-2 ring-[#2e7ad1]/40 shadow-sm',
      )}
    >
      {children}
    </button>
  );
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

  const { containerRef, isActive, setCell } = useExcelTableNavigation({
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
      <ExcelSheetShell
        title="Users"
        rowCount={rows.length}
        loading={loading}
        hint="Arrow keys navigate · Enter on Password / Activity / Block / Delete"
        className="flex min-h-0 flex-1 flex-col"
      >
        <div
          ref={containerRef}
          className={cn('min-h-0 min-h-[240px] w-full flex-1 bg-white', xlScrollClass)}
          onMouseDown={(e) => {
            const cell = (e.target as HTMLElement).closest('[data-grid-row]');
            if (cell) {
              const row = Number(cell.getAttribute('data-grid-row'));
              const col = Number(cell.getAttribute('data-grid-col'));
              if (!Number.isNaN(row) && !Number.isNaN(col)) setCell({ row, col });
            }
          }}
        >
          <table className="w-full min-w-[960px] border-collapse text-[13px]">
            <thead className="sticky top-0 z-20">
              <tr>
                {COLUMNS.map((label, i) => (
                  <th
                    key={label}
                    className={cn(
                      'border border-[#c6c6c6] bg-[#f2f2f2] px-2 py-1.5 text-xs font-semibold text-slate-800',
                      i === 0 && 'sticky left-0 z-40 w-10 text-center',
                      i >= 7 && 'text-center min-w-[72px]',
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
                    <RefreshCw className="mx-auto mb-2 h-5 w-5 animate-spin text-[#2e7ad1]" />
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
                    <tr
                      key={row.userId}
                      className="even:bg-[#fafafa] transition-colors duration-150 hover:bg-[#e7f3ff]/35"
                    >
                      <GridCell
                        row={rowIndex}
                        col={0}
                        active={isActive(rowIndex, 0)}
                        sticky
                        align="center"
                        onActivate={activate(0)}
                        className="text-[11px] text-slate-500"
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
                      <GridCell
                        row={rowIndex}
                        col={5}
                        active={isActive(rowIndex, 5)}
                        onActivate={activate(5)}
                        className={row.active ? STATUS_STYLES.active : STATUS_STYLES.blocked}
                      >
                        {row.active ? 'Active' : 'Blocked'}
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
                        className={isActive(rowIndex, 7) ? 'bg-[#e7f3ff]' : undefined}
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenPassword(row.userId, row.name);
                          }}
                          title="View password (Enter)"
                          className={cn(
                            'pointer-events-auto text-[11px] font-semibold text-[#2e7ad1] underline decoration-[#2e7ad1]/40 underline-offset-2 hover:text-[#2568b8]',
                            isActive(rowIndex, 7) && 'decoration-[#2e7ad1]',
                          )}
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
                            className="pointer-events-auto text-[11px] font-semibold text-[#2e7ad1] underline decoration-[#2e7ad1]/40 underline-offset-2 hover:text-[#2568b8]"
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
                          <XlActionButton
                            active={isActive(rowIndex, 9)}
                            variant="warn"
                            disabled={actionLoading === `block-${row.userId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleBlock(row.userId, row.active);
                            }}
                          >
                            {row.active ? 'Block' : 'Unblock'}
                          </XlActionButton>
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
                          <XlActionButton
                            active={isActive(rowIndex, 10)}
                            variant="danger"
                            disabled={actionLoading === `delete-${row.userId}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              onDelete(row.userId, row.name);
                            }}
                          >
                            Delete
                          </XlActionButton>
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
      </ExcelSheetShell>
    </div>
  );
}
