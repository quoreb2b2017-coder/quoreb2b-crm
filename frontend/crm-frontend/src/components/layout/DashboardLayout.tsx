'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useCallback, useEffect, memo } from 'react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/store/auth.store';
import { useAdminProductStore } from '@/store/admin-product.store';
import { useIdleLogout } from '@/hooks/useIdleLogout';
import { useGlobalSpreadsheetCopyGuard } from '@/hooks/useSpreadsheetCopyGuard';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { MeetingRequestBell } from '@/components/dashboard/MeetingRequestBell';
import { QuickNotePad } from '@/components/notes/QuickNotePad';
import { useNavigation } from '@/components/providers/LoadingProvider';
import {
  quickActionIcons,
  useAttendancePanelOptional,
} from '@/components/attendance/AttendancePanelContext';

export type DashboardVariant = 'admin' | 'db_admin' | 'employee';

/** Batch spreadsheet view (not list / team) */
export function isBatchExcelViewPath(pathname: string) {
  return (
    (/\/batches\/[^/]+$/.test(pathname) && !pathname.endsWith('/team')) ||
    /^\/employee\/my-data\/[^/]+$/.test(pathname)
  );
}

/** Batches library (month folders list) */
export function isBatchesListPath(pathname: string) {
  return /^\/(admin|db-admin|employee)\/batches$/.test(pathname);
}

export function isQcPath(pathname: string) {
  return /^\/(admin|employee)\/qc(\/ready)?$/.test(pathname);
}

/** Batch team / activity page */
export function isBatchTeamPath(pathname: string) {
  return /\/batches\/[^/]+\/team$/.test(pathname);
}

/** Users table only — fixed viewport, inner table scrolls */
export function isAdminUsersListPath(pathname: string) {
  return pathname === '/admin/users';
}

/** User activity report — full width, page scrolls */
export function isAdminUserReportPath(pathname: string) {
  return /^\/admin\/users\/[^/]+\/report$/.test(pathname);
}

/** Master data spreadsheet (admin upload + DB admin read-only master file) */
export function isMasterDataSpreadsheetPath(pathname: string) {
  return (
    pathname.startsWith('/admin/master-data-upload') ||
    pathname === '/db-admin/master-file'
  );
}

/** Pages that fill the content area edge-to-edge (no side padding) */
export function isAdminFullBleedPath(pathname: string) {
  return (
    isBatchExcelViewPath(pathname) ||
    isBatchesListPath(pathname) ||
    isQcPath(pathname) ||
    isBatchTeamPath(pathname) ||
    isMasterDataSpreadsheetPath(pathname) ||
    isAdminUsersListPath(pathname)
  );
}

/** Activity logs — full width, page scrolls (all panels) */
export function isActivityLogsPath(pathname: string) {
  return /^\/(admin|db-admin|employee)\/activity-logs$/.test(pathname);
}

/** Role dashboards — full width, page scrolls */
export function isPanelDashboardPath(pathname: string) {
  return /^\/(admin|db-admin|employee)\/dashboard$/.test(pathname);
}

export function isPanelAnalyticsPath(pathname: string) {
  return pathname === '/admin/analytics';
}

export function isPanelSettingsPath(pathname: string) {
  return /^\/(admin|db-admin|employee)\/settings$/.test(pathname);
}

/** Attendance pages (list + details) — full width, page scrolls */
export function isAttendancePath(pathname: string) {
  return /^\/(admin|db-admin|employee)\/attendance(\/.*)?$/.test(pathname);
}

/** Leave apply pages — full width, page scrolls */
export function isLeaveApplyPath(pathname: string) {
  return /^\/(admin|db-admin|employee)\/leave-apply$/.test(pathname);
}

/** Personal notes — full viewport height, inner panels scroll */
export function isPersonalNotesPath(pathname: string) {
  return /^\/(admin|db-admin|employee)\/personal-notes$/.test(pathname);
}

/** Edge-to-edge content (no left/right padding) */
export function isAdminEdgeToEdgePath(pathname: string) {
  return (
    isAdminFullBleedPath(pathname) ||
    isAdminUserReportPath(pathname) ||
    isActivityLogsPath(pathname) ||
    isPanelDashboardPath(pathname) ||
    isPanelSettingsPath(pathname) ||
    isAttendancePath(pathname) ||
    isLeaveApplyPath(pathname) ||
    isPersonalNotesPath(pathname)
  );
}

/** Viewport locked; only inner regions scroll (not the whole page) */
export function isAdminContentLockedPath(pathname: string) {
  return (
    isAdminFullBleedPath(pathname) &&
    !isAdminUserReportPath(pathname) &&
    !isActivityLogsPath(pathname) &&
    !isPanelDashboardPath(pathname) &&
    !isPanelAnalyticsPath(pathname) &&
    !isPanelSettingsPath(pathname)
  );
}

interface NavItem {
  label: string;
  href: string;
  icon?: React.ReactNode;
  badgeCount?: number;
  children?: { label: string; href: string; external?: boolean }[];
}

interface DashboardLayoutProps {
  children: React.ReactNode;
  title: string;
  variant: DashboardVariant;
  navItems: NavItem[];
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Icons = {
  dashboard: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>
    </svg>
  ),
  users: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
    </svg>
  ),
  companies: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21h18M3 7l9-4 9 4M4 7v14M20 7v14M9 21V11h6v10"/>
    </svg>
  ),
  leads: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
    </svg>
  ),
  campaigns: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/>
    </svg>
  ),
  logs: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"/>
    </svg>
  ),
  settings: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  ),
  tasks: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
    </svg>
  ),
  health: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  indexes: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>
    </svg>
  ),
  backups: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"/>
    </svg>
  ),
  attendance: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
    </svg>
  ),
  leave: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M12 18v-6M9 15h6"/>
    </svg>
  ),
  upload: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0l4-4m-4 4L8 11M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2"/>
    </svg>
  ),
  logout: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
    </svg>
  ),
  chevronLeft: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6"/>
    </svg>
  ),
  menu: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6h16M4 12h16M4 18h16"/>
    </svg>
  ),
  bell: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  ),
};

const iconMap: Record<string, React.ReactNode> = {
  'dashboard':          Icons.dashboard,
  'users':              Icons.users,
  'all users':          Icons.users,
  'companies':          Icons.companies,
  'leads':              Icons.leads,
  'my leads':           Icons.leads,
  'campaigns':          Icons.campaigns,
  'analytics':          Icons.leads,
  'activity logs':      Icons.logs,
  'settings':           Icons.settings,
  'tasks':              Icons.tasks,
  'database health':    Icons.health,
  'indexes':            Icons.indexes,
  'backups':            Icons.backups,
  'master data':        Icons.upload,
  'master data upload': Icons.upload,
  'db admin data':      Icons.upload,
  'master file':        Icons.upload,
  'my data':            Icons.upload,
  'employee data':      Icons.upload,
  'email verification': Icons.upload,
  'db admin data requests': Icons.upload,
  'db admin upload requests': Icons.upload,
  'my batches':         Icons.logs,
  'my campaigns':       Icons.logs,
  'my qc':              Icons.leads,
  'all qc':             Icons.leads,
  'attendance':         Icons.attendance,
  'leave requests':     Icons.leave,
  'leave apply':        Icons.leave,
  'personal notes':     Icons.tasks,
  'mark attendance':    Icons.attendance,
  'apply for leave':    Icons.leave,
};

function getIcon(label: string) {
  return iconMap[label.toLowerCase()] ?? Icons.dashboard;
}

// ─── Theme config ─────────────────────────────────────────────────────────────
const themes = {
  admin: {
    color:       '#6366f1',
    activeBg:    'bg-indigo-500/[0.15]',
    activeBorder:'border-indigo-400',
    activeText:  'text-indigo-300',
    activeDot:   'bg-indigo-400',
    badgeBg:     'bg-indigo-500',
    badgeRing:   'ring-indigo-500/30',
    headerDot:   'bg-indigo-500',
  },
  db_admin: {
    color:       '#8b5cf6',
    activeBg:    'bg-violet-500/[0.15]',
    activeBorder:'border-violet-400',
    activeText:  'text-violet-300',
    activeDot:   'bg-violet-400',
    badgeBg:     'bg-violet-500',
    badgeRing:   'ring-violet-500/30',
    headerDot:   'bg-violet-500',
  },
  employee: {
    color:       '#10b981',
    activeBg:    'bg-emerald-500/[0.15]',
    activeBorder:'border-emerald-400',
    activeText:  'text-emerald-300',
    activeDot:   'bg-emerald-400',
    badgeBg:     'bg-emerald-500',
    badgeRing:   'ring-emerald-500/30',
    headerDot:   'bg-emerald-500',
  },
};

const roleLabel: Record<DashboardVariant, string> = {
  admin:    'Super Admin',
  db_admin: 'DB Administrator',
  employee: 'Employee',
};

function isNavItemActive(pathname: string, href: string) {
  if (pathname === href) return true;
  if (/\/dashboard$/.test(href)) return false;
  return href.length > 7 && pathname.startsWith(href);
}

function navSpinnerClass(variant: DashboardVariant) {
  return cn(
    'h-3.5 w-3.5 flex-shrink-0 rounded-full border-2 border-white/20 animate-spin',
    variant === 'admin' && 'border-t-indigo-300',
    variant === 'db_admin' && 'border-t-violet-300',
    variant === 'employee' && 'border-t-emerald-300',
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
function Avatar({ name, collapsed, variant }: { name: string; collapsed: boolean; variant: DashboardVariant }) {
  const t = themes[variant];
  const initials = name.trim().split(' ').map(p => p[0] ?? '').slice(0, 2).join('').toUpperCase();
  return (
    <span className={cn(
      'inline-flex items-center justify-center rounded-xl text-white font-bold flex-shrink-0 ring-2 transition-all duration-300',
      t.badgeBg, t.badgeRing,
      collapsed ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm',
    )}>
      {initials}
    </span>
  );
}

// ─── Tooltip wrapper (shown only when collapsed) ──────────────────────────────
function Tip({ label, children, collapsed }: { label: string; children: React.ReactNode; collapsed: boolean }) {
  if (!collapsed) return <>{children}</>;
  return (
    <div className="relative group/tip">
      {children}
      <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50
                      opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150">
        <div className="bg-slate-800 text-white text-xs font-medium px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-xl border border-white/10">
          {label}
          <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-slate-800"/>
        </div>
      </div>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────────────────

// ── Sidebar inner component (must be outside DashboardLayout to avoid re-creation) ──
interface SidebarProps {
  collapsed: boolean;
  isMobile: boolean;
  variant: DashboardVariant;
  navItems: NavItem[];
  pathname: string;
  displayName: string;
  onCollapse: () => void;
  onExpand: () => void;
  onLogout: () => void;
  user: { employeeId?: string; email?: string } | null;
}

function SidebarInner({
  collapsed, isMobile, variant, navItems, pathname,
  displayName, onCollapse, onExpand, onLogout, user,
}: SidebarProps) {
  const t = themes[variant];
  const isCollapsed = isMobile ? false : collapsed;
  const attendancePanel = useAttendancePanelOptional();
  const showQuickActions =
    attendancePanel &&
    (variant === 'employee' || variant === 'db_admin' || variant === 'admin');
  /** Today is auto-marked on CRM login — employees must not manual-mark. */
  const showMarkToday = variant !== 'employee';

  return (
    <div className={cn(
      'flex flex-col h-full bg-[#0d0f14] border-r border-white/[0.05] overflow-hidden',
      isCollapsed ? 'w-[68px]' : 'w-[240px]',
    )}>
      {/* ── Logo + collapse btn ── */}
      <div className={cn(
        'flex items-center border-b border-white/[0.05] flex-shrink-0',
        isCollapsed ? 'justify-center px-0 py-4 h-[64px]' : 'justify-between px-4 h-[64px]',
      )}>
        {!isCollapsed && (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', t.badgeBg)}>
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-white font-bold text-sm leading-none">QuoreB2B</p>
              <p className="text-[10px] text-slate-500 mt-0.5">CRM Platform</p>
            </div>
          </div>
        )}
        {isCollapsed && (
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', t.badgeBg)}>
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
          </div>
        )}
        {!isMobile && !isCollapsed && (
          <button onClick={onCollapse} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.07] transition-colors flex-shrink-0" title="Collapse sidebar">
            <span className="w-4 h-4 block">{Icons.chevronLeft}</span>
          </button>
        )}
      </div>

      {/* ── Expand btn when collapsed ── */}
      {!isMobile && isCollapsed && (
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <button onClick={onExpand} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.07] transition-colors" title="Expand sidebar">
            <span className="w-4 h-4 block rotate-180">{Icons.chevronLeft}</span>
          </button>
        </div>
      )}

      {/* ── Role pill ── */}
      {!isCollapsed && (
        <div className="px-4 pt-4 pb-1 flex-shrink-0">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-white/[0.05] text-slate-400">
            <span className={cn('w-1.5 h-1.5 rounded-full', t.activeDot)} />
            {roleLabel[variant]}
          </span>
        </div>
      )}

      {/* ── Nav items ── */}
      <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden py-2', isCollapsed ? 'px-2' : 'px-3')}>
        {navItems.map((item) => {
          const active = pathname === item.href || (item.href !== '/admin/dashboard' && pathname.startsWith(item.href) && item.href.length > 7);
          return (
            <Tip key={item.href} label={item.label} collapsed={isCollapsed}>
              <Link
                href={item.href}
                prefetch={true}
                className={cn(
                  'flex items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-100 group mb-0.5 cursor-pointer select-none',
                  isCollapsed ? 'justify-center w-11 h-11 mx-auto' : 'px-3 py-3',
                  active
                    ? cn(t.activeBg, t.activeText, !isCollapsed && `border-l-2 ${t.activeBorder} pl-[10px]`)
                    : 'text-slate-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12]',
                )}
              >
                <span className={cn(
                  'flex-shrink-0 w-5 h-5 transition-colors duration-100',
                  active ? t.activeText : 'text-slate-500 group-hover:text-slate-200',
                )}>
                  {item.icon ?? getIcon(item.label)}
                </span>
                {!isCollapsed && (
                  <>
                    <span className="flex-1 truncate">{item.label}</span>
                    {active && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', t.activeDot)} />}
                  </>
                )}
              </Link>
            </Tip>
          );
        })}

        {showQuickActions && (
          <div className={cn('mt-4', isCollapsed ? 'space-y-1' : '')}>
            {!isCollapsed && (
              <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Quick actions
              </p>
            )}
            {showMarkToday && (
              <Tip label="Mark attendance" collapsed={isCollapsed}>
                <button
                  type="button"
                  onClick={attendancePanel!.openMark}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-100 mb-0.5',
                    isCollapsed ? 'justify-center w-11 h-11 mx-auto text-slate-400 hover:text-white hover:bg-white/[0.08]' : 'px-3 py-2.5 text-slate-400 hover:text-white hover:bg-emerald-500/[0.12] border border-transparent hover:border-emerald-500/20',
                  )}
                >
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                    {quickActionIcons.mark}
                  </span>
                  {!isCollapsed && <span className="flex-1 text-left">Mark Today</span>}
                </button>
              </Tip>
            )}
            <Tip label="Apply for leave" collapsed={isCollapsed}>
              <button
                type="button"
                onClick={attendancePanel!.openLeave}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl text-sm font-medium transition-colors duration-100',
                  isCollapsed ? 'justify-center w-11 h-11 mx-auto text-slate-400 hover:text-white hover:bg-white/[0.08]' : 'px-3 py-2.5 text-slate-400 hover:text-white hover:bg-violet-500/[0.12] border border-transparent hover:border-violet-500/20',
                )}
              >
                <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
                  {quickActionIcons.leave}
                </span>
                {!isCollapsed && <span className="flex-1 text-left">Apply Leave</span>}
              </button>
            </Tip>
          </div>
        )}
      </nav>

      {/* ── Divider ── */}
      <div className={cn('border-t border-white/[0.05] flex-shrink-0', isCollapsed ? 'mx-2' : 'mx-3')} />

      {/* ── User + logout ── */}
      <div className={cn('py-3 flex-shrink-0', isCollapsed ? 'px-2' : 'px-3')}>
        {!isCollapsed ? (
          <>
            <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-white/[0.03] mb-1">
              <Avatar name={displayName} collapsed={false} variant={variant} />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-white truncate leading-tight">{displayName}</p>
                <p className="text-[10px] text-slate-500 truncate mt-0.5">{user?.employeeId ?? user?.email}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors duration-100 group"
            >
              <span className="w-[18px] h-[18px] flex-shrink-0 group-hover:text-red-400 transition-colors">{Icons.logout}</span>
              <span>Sign out</span>
            </button>
          </>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Tip label={displayName} collapsed>
              <Avatar name={displayName} collapsed variant={variant} />
            </Tip>
            <Tip label="Sign out" collapsed>
              <button
                onClick={onLogout}
                className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors"
              >
                <span className="w-[18px] h-[18px]">{Icons.logout}</span>
              </button>
            </Tip>
          </div>
        )}
      </div>
    </div>
  );
}

export function DashboardLayout({ children, title, variant, navItems }: DashboardLayoutProps) {
  useGlobalSpreadsheetCopyGuard();
  const pathname = usePathname() ?? '';
  const { pendingHref, isNavigating, startNavigation } = useNavigation();
  const batchExcelView = isBatchExcelViewPath(pathname);
  const attendancePage = isAttendancePath(pathname);
  const personalNotesPage = isPersonalNotesPath(pathname);
  const edgeToEdge = isAdminEdgeToEdgePath(pathname) || attendancePage;
  const contentLocked = isAdminContentLockedPath(pathname) || personalNotesPage;
  const { user, clearAuth } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [idleWarn, setIdleWarn] = useState(false);
  const t = themes[variant];
  const portalTracking =
    variant === 'employee' || variant === 'db_admin' || variant === 'admin';

  const onIdleWarn = useCallback(() => setIdleWarn(true), []);
  const onDismissIdleWarn = useCallback(() => setIdleWarn(false), []);
  const { logout: portalLogout } = useIdleLogout(portalTracking, onIdleWarn, onDismissIdleWarn);

  // close mobile on route change
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const handleLogout = useCallback(async () => {
    if (portalTracking) {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('work-time:stash'));
      }
      await portalLogout('manual');
      return;
    }
    if (variant === 'admin') {
      useAdminProductStore.getState().resetForLogout();
    }
    clearAuth();
    window.location.href = '/';
  }, [portalTracking, portalLogout, clearAuth, variant]);

  const displayName = user?.firstName && user?.lastName
    ? `${user.firstName} ${user.lastName}`
    : user?.email ?? 'User';

  const currentNavLabel =
    navItems.find((n) => n.href === pendingHref)?.label ??
    navItems.find((n) => isNavItemActive(pathname, n.href))?.label ??
    'Overview';

  const handleNavClick = useCallback(
    (href: string) => {
      startNavigation(href);
      setMobileOpen(false);
    },
    [startNavigation],
  );

  // ── Sidebar content ──────────────────────────────────────────────────────
  const SidebarContent = memo(({ isMobile = false }: { isMobile?: boolean }) => {
    const isCollapsed = isMobile ? false : collapsed;
    return (
      <div className={cn(
        'flex flex-col h-full bg-[#0d0f14] border-r border-white/[0.05] transition-all duration-300 overflow-hidden',
        isCollapsed ? 'w-[68px]' : 'w-[240px]',
      )}>

        {/* ── Logo + collapse btn ── */}
        <div className={cn(
          'flex items-center border-b border-white/[0.05] flex-shrink-0',
          isCollapsed ? 'justify-center px-0 py-4 h-[64px]' : 'justify-between px-4 h-[64px]',
        )}>
          {!isCollapsed && (
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', t.badgeBg)}>
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm leading-none">QuoreB2B</p>
                <p className="text-[10px] text-slate-500 mt-0.5">CRM Platform</p>
              </div>
            </div>
          )}
          {isCollapsed && (
            <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', t.badgeBg)}>
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 10V3L4 14h7v7l9-11h-7z"/>
              </svg>
            </div>
          )}
          {!isMobile && !isCollapsed && (
            <button
              onClick={() => setCollapsed(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.07] transition-all flex-shrink-0"
              title="Collapse sidebar"
            >
              <span className="w-4 h-4 block">{Icons.chevronLeft}</span>
            </button>
          )}
        </div>

        {/* ── Expand btn when collapsed ── */}
        {!isMobile && isCollapsed && (
          <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
            <button
              onClick={() => setCollapsed(false)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.07] transition-all"
              title="Expand sidebar"
            >
              <span className="w-4 h-4 block rotate-180">{Icons.chevronLeft}</span>
            </button>
          </div>
        )}

        {/* ── Role pill ── */}
        {!isCollapsed && (
          <div className="px-4 pt-4 pb-1 flex-shrink-0">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-md bg-white/[0.05] text-slate-400">
              <span className={cn('w-1.5 h-1.5 rounded-full', t.activeDot)} />
              {roleLabel[variant]}
            </span>
          </div>
        )}

        {/* ── Nav items ── */}
        <nav className={cn('flex-1 overflow-y-auto overflow-x-hidden py-2', isCollapsed ? 'px-2' : 'px-3')}>
          {navItems.map((item) => {
            const active = isNavItemActive(pathname, item.href);
            const pending = pendingHref === item.href && !active;
            const childActive = item.children?.some((c) => pathname === c.href || pendingHref === c.href);
            const [open, setOpen] = useState(() => !!childActive);

            if (item.children?.length) {
              // ── Group with dropdown ──
              return (
                <div key={item.href} className="mb-0.5">
                  <Tip label={item.label} collapsed={isCollapsed}>
                    <button
                      onClick={() => !isCollapsed && setOpen(v => !v)}
                      className={cn(
                        'w-full flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 group cursor-pointer select-none',
                        isCollapsed ? 'justify-center w-11 h-11 mx-auto' : 'px-3 py-3',
                        childActive
                          ? cn(t.activeBg, t.activeText)
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12]',
                      )}
                    >
                      <span className={cn(
                        'flex-shrink-0 w-5 h-5 transition-colors duration-200',
                        childActive ? t.activeText : 'text-slate-500 group-hover:text-slate-200',
                      )}>
                        {item.icon ?? getIcon(item.label)}
                      </span>
                      {!isCollapsed && (
                        <>
                          <span className="flex-1 truncate text-left">{item.label}</span>
                          <svg
                            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                            strokeLinecap="round" strokeLinejoin="round"
                            className={cn('w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200', open && 'rotate-180')}
                          >
                            <path d="M6 9l6 6 6-6"/>
                          </svg>
                        </>
                      )}
                    </button>
                  </Tip>
                  {/* Sub-items */}
                  {!isCollapsed && open && (
                    <div className="ml-4 mt-0.5 pl-3 border-l border-white/[0.07] space-y-0.5">
                      {item.children.map(child => {
                        const cActive = pathname === child.href;
                        const cPending = pendingHref === child.href && !cActive;
                        const Tag = child.external ? 'a' : Link;
                        const extraProps = child.external
                          ? { href: child.href }
                          : { href: child.href, onClick: () => handleNavClick(child.href) };
                        return (
                          <Tag
                            key={child.href}
                            {...extraProps}
                            className={cn(
                              'tap-smooth flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all duration-200',
                              cActive
                                ? cn(t.activeBg, t.activeText)
                                : cPending
                                  ? cn(t.activeBg, 'text-white/90')
                                  : 'text-slate-500 hover:text-white hover:bg-white/[0.06]',
                            )}
                          >
                            {cPending ? (
                              <span className={navSpinnerClass(variant)} aria-hidden />
                            ) : (
                              <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cActive ? t.activeDot : 'bg-slate-600')} />
                            )}
                            {child.label}
                            {child.external && (
                              <svg className="w-3 h-3 ml-auto opacity-40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/>
                              </svg>
                            )}
                          </Tag>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            // ── Regular item ──
            return (
              <Tip key={item.href} label={item.label} collapsed={isCollapsed}>
                <Link
                  href={item.href}
                  prefetch={true}
                  onClick={() => handleNavClick(item.href)}
                  aria-current={active ? 'page' : undefined}
                  aria-busy={pending || undefined}
                  className={cn(
                    'tap-smooth flex items-center gap-3 rounded-xl text-sm font-medium transition-all duration-200 group mb-0.5 cursor-pointer select-none',
                    isCollapsed ? 'relative justify-center w-11 h-11 mx-auto' : 'px-3 py-3',
                    active
                      ? cn(t.activeBg, t.activeText, !isCollapsed && `border-l-2 ${t.activeBorder} pl-[10px]`)
                      : pending
                        ? cn(t.activeBg, 'text-white/90 ring-1 ring-white/10')
                        : 'text-slate-400 hover:text-white hover:bg-white/[0.08] active:bg-white/[0.12]',
                  )}
                >
                  <span className={cn(
                    'flex-shrink-0 w-5 h-5 transition-colors duration-200',
                    active || pending ? t.activeText : 'text-slate-500 group-hover:text-slate-200',
                  )}>
                    {item.icon ?? getIcon(item.label)}
                  </span>
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 truncate">{item.label}</span>
                      {!!item.badgeCount && item.badgeCount > 0 && (
                        <span
                          className={cn(
                            'inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold text-white',
                            t.badgeBg,
                          )}
                        >
                          {item.badgeCount > 99 ? '99+' : item.badgeCount}
                        </span>
                      )}
                      {pending && <span className={navSpinnerClass(variant)} aria-hidden />}
                      {active && !pending && <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', t.activeDot)} />}
                    </>
                  )}
                  {isCollapsed && pending && <span className={cn('absolute bottom-1 right-1 h-1.5 w-1.5 rounded-full animate-pulse', t.activeDot)} />}
                </Link>
              </Tip>
            );
          })}
        </nav>

        {/* ── Divider ── */}
        <div className={cn('border-t border-white/[0.05] flex-shrink-0', isCollapsed ? 'mx-2' : 'mx-3')} />

        {/* ── User + logout ── */}
        <div className={cn('py-3 flex-shrink-0', isCollapsed ? 'px-2' : 'px-3')}>
          {!isCollapsed ? (
            <>
              <div className="flex items-center gap-2.5 px-2 py-2 rounded-xl bg-white/[0.03] mb-1">
                <Avatar name={displayName} collapsed={false} variant={variant} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate leading-tight">{displayName}</p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{user?.employeeId ?? user?.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-slate-500 hover:text-red-400 hover:bg-red-500/[0.08] transition-all duration-150 group"
              >
                <span className="w-[18px] h-[18px] flex-shrink-0 group-hover:text-red-400 transition-colors">{Icons.logout}</span>
                <span>Sign out</span>
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Tip label={displayName} collapsed>
                <Avatar name={displayName} collapsed variant={variant} />
              </Tip>
              <Tip label="Sign out" collapsed>
                <button
                  onClick={handleLogout}
                  className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-500 hover:text-red-400 hover:bg-red-500/[0.08] transition-all"
                >
                  <span className="w-[18px] h-[18px]">{Icons.logout}</span>
                </button>
              </Tip>
            </div>
          )}
        </div>
      </div>
    );
  });

  return (
    <div
      className={cn(
        'flex bg-slate-50/80',
        contentLocked ? 'h-screen overflow-hidden' : 'min-h-screen',
      )}
    >

      {/* ── Desktop sidebar ── */}
      <aside className="hidden lg:block flex-shrink-0 h-screen sticky top-0 transition-all duration-300"
        style={{ width: collapsed ? 68 : 240 }}>
        <SidebarContent isMobile={false} />
      </aside>

      {/* ── Mobile overlay + drawer ── */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="fixed inset-y-0 left-0 z-50 lg:hidden">
            <SidebarContent isMobile />
          </aside>
        </>
      )}

      {/* ── Main content ── */}
      <main className="flex flex-1 min-h-0 min-w-0 flex-col">

        {/* ── Top header ── */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 h-[64px] flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile menu btn */}
            <button
              type="button"
              className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
              onClick={() => setMobileOpen(true)}
            >
              <span className="w-5 h-5 block">{Icons.menu}</span>
            </button>

            {/* Breadcrumb */}
            <div className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full flex-shrink-0', t.headerDot)} />
              <h1 className="text-[15px] font-semibold text-slate-800">{title}</h1>
              <span className="text-slate-300 text-sm hidden sm:block">/</span>
              <span className="text-sm text-slate-400 hidden sm:block capitalize transition-opacity duration-200">
                {isNavigating && pendingHref ? (
                  <span className="inline-flex items-center gap-1.5 text-slate-500">
                    <span className={cn('h-1.5 w-1.5 rounded-full animate-pulse', t.headerDot)} />
                    {currentNavLabel}
                  </span>
                ) : (
                  currentNavLabel
                )}
              </span>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center gap-2">
            {/* Notification bell */}
            <NotificationBell />
            {(variant === 'admin') && <MeetingRequestBell />}

            {/* User chip */}
            <div className={cn(
              'hidden sm:flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-xl text-xs font-medium text-white',
              t.badgeBg,
            )}>
              <span className="w-5 h-5 flex-shrink-0">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
              </span>
              <span className="truncate max-w-[120px]">{displayName}</span>
            </div>
          </div>
        </header>

        {/* ── Idle warning ── */}
        {idleWarn && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 flex-shrink-0">
            <p className="text-sm text-amber-800 font-medium">
              ⚠️ You will be logged out in 1 minute due to inactivity.
            </p>
            <button
              type="button"
              onClick={onDismissIdleWarn}
              className="tap-smooth text-xs font-medium text-amber-700 underline hover:text-amber-900 whitespace-nowrap"
            >
              I&apos;m still here
            </button>
          </div>
        )}

        {/* ── Page content ── */}
        <div
          className={cn(
            'flex-1 min-h-0 min-w-0 w-full transition-opacity duration-200',
            edgeToEdge ? 'p-0' : 'overflow-auto p-4 sm:p-6',
            contentLocked ? 'flex flex-col overflow-hidden' : 'overflow-y-auto overflow-x-hidden',
            attendancePage && 'overflow-y-auto',
            isNavigating && 'opacity-80',
          )}
        >
          <div
            key={pathname}
            className={cn(
              'min-h-0 min-w-0 w-full max-w-none flex-1 animate-page-enter',
              edgeToEdge ? 'flex flex-col self-stretch' : '',
              attendancePage && 'attendance-full-bleed',
            )}
          >
            {children}
          </div>
        </div>
      </main>

      <QuickNotePad variant={variant} />
    </div>
  );
}
