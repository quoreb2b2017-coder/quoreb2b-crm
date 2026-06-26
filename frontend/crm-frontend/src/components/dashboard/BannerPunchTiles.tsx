'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Coffee,
  UtensilsCrossed,
  Users,
  LogIn,
  LogOut,
  Fingerprint,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useBreakPunch } from '@/hooks/useBreakPunch';
import { toast } from '@/stores/toast.store';
import { formatRemainingShort, formatBreakDuration, type BreakType } from '@/lib/api/break-punch.service';
import { attendanceService } from '@/lib/api/attendance.service';
import { activityLogsService } from '@/lib/api/activity-logs.service';
import apiClient from '@/lib/api/client';
import { useAuthStore } from '@/store/auth.store';
import { todayDateKeyIst } from '@/lib/attendance/ist-date';
import { peekLoginPunch } from '@/lib/auth/login-punch';
import type { AttendancePunchOnLogin } from '@/types/auth';

type BreakKey = BreakType;
type TileTone = 'work' | 'tea' | 'lunch' | 'meeting';

const toneStyles: Record<
  TileTone,
  { shell: string; icon: string; active: string; dot: string }
> = {
  work: {
    shell: 'border-white/25 bg-white/12 hover:bg-white/18',
    icon: 'bg-white/20 text-white',
    active: 'border-sky-300/60 bg-sky-400/20 ring-1 ring-sky-300/40',
    dot: 'bg-sky-300',
  },
  tea: {
    shell: 'border-amber-300/30 bg-amber-400/10 hover:bg-amber-400/18',
    icon: 'bg-amber-400/25 text-amber-100',
    active: 'border-amber-300/70 bg-amber-400/30 ring-1 ring-amber-300/50',
    dot: 'bg-amber-300',
  },
  lunch: {
    shell: 'border-white/25 bg-white/12 hover:bg-white/18',
    icon: 'bg-white/20 text-white',
    active: 'border-white/50 bg-white/20 ring-1 ring-white/30',
    dot: 'bg-white/80',
  },
  meeting: {
    shell: 'border-white/20 bg-white/10 hover:bg-white/16',
    icon: 'bg-white/18 text-white',
    active: 'border-white/45 bg-white/18 ring-1 ring-white/25',
    dot: 'bg-white/70',
  },
};

function PunchTile({
  label,
  meta,
  sublabel,
  tone,
  icon: Icon,
  active,
  disabled,
  busy,
  onClick,
}: {
  label: string;
  meta?: string;
  sublabel?: string;
  tone: TileTone;
  icon: typeof Coffee;
  active?: boolean;
  disabled?: boolean;
  busy?: boolean;
  onClick: () => void;
}) {
  const t = toneStyles[tone];

  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      className={cn(
        'group relative flex min-w-0 flex-col items-stretch gap-1 rounded-lg border px-2 py-1.5 backdrop-blur-md transition-all duration-200 dash-punch-tile',
        'active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45',
        active ? t.active : t.shell,
      )}
    >
      {active && (
        <span
          className={cn('absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full', t.dot)}
        />
      )}
      <span className="flex min-w-0 items-center gap-1.5">
        <span
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow-sm transition-transform group-hover:scale-105 dash-punch-tile__icon',
            t.icon,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="dash-punch-tile__label block truncate font-bold leading-tight text-white">
            {busy ? '…' : label}
          </span>
          {(meta || sublabel) && (
            <span
              className="dash-punch-tile__meta block truncate font-mono tabular-nums text-white/80"
              title={[meta, sublabel].filter(Boolean).join(' · ')}
            >
              {[meta, sublabel].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

/** Day ended: login (left) | logout time (right) — read-only after EOD. */
function WorkDayClosedTile({
  loginTime,
  logoutTime,
}: {
  loginTime?: string;
  logoutTime?: string;
}) {
  const t = toneStyles.work;

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-row items-stretch overflow-hidden rounded-lg border backdrop-blur-md dash-punch-eod dash-punch-eod--closed',
        t.shell,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-1.5">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md shadow-sm', t.icon)}>
          <LogIn className="h-3 w-3" strokeWidth={2} />
        </span>
        <div className="min-w-0 text-left">
          <span className="text-[8px] font-bold uppercase tracking-wide text-white/50">Login</span>
          <span className="block truncate font-mono text-[10px] font-semibold tabular-nums text-white">
            {loginTime ?? '—'}
          </span>
        </div>
      </div>

      <div className="w-px shrink-0 self-stretch bg-white/30" aria-hidden />

      <div className="flex min-w-0 flex-1 items-center justify-center gap-1 px-2 py-1.5">
        <span className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md shadow-sm', t.icon)}>
          <LogOut className="h-3 w-3" strokeWidth={2} />
        </span>
        <div className="min-w-0 text-left">
          <span className="text-[8px] font-bold uppercase tracking-wide text-white/50">Logout</span>
          <span className="block truncate font-mono text-[10px] font-semibold tabular-nums text-white">
            {logoutTime ?? '—'}
          </span>
        </div>
      </div>
    </div>
  );
}

/** On duty: login time (left) | vertical rule | EOD logout (right). */
function WorkEodSplitTile({
  loginTime,
  busy,
  onEodLogout,
}: {
  loginTime?: string;
  busy?: boolean;
  onEodLogout: () => void;
}) {
  const t = toneStyles.work;

  return (
    <div
      className={cn(
        'relative flex min-w-0 flex-row items-stretch overflow-hidden rounded-lg border backdrop-blur-md dash-punch-eod',
        t.active,
      )}
    >
      <span
        className={cn('absolute right-1 top-1 z-10 h-1 w-1 animate-pulse rounded-full lg:right-1 lg:top-1', t.dot)}
      />

      <div className="flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2">
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow-sm dash-punch-tile__icon', t.icon)}>
          <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 text-left">
          <span className="dash-punch-tile__label block text-[8px] font-bold uppercase tracking-wide text-white/55">Login</span>
          <span className="dash-punch-tile__meta block truncate font-mono text-white">
            {loginTime ?? '—'}
          </span>
        </div>
      </div>

      <div className="w-px shrink-0 self-stretch bg-white/30" aria-hidden />

      <button
        type="button"
        disabled={busy}
        onClick={onEodLogout}
        className={cn(
          'flex min-w-0 flex-1 items-center gap-1.5 px-2.5 py-2 transition-colors',
          'hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md shadow-sm dash-punch-tile__icon', t.icon)}>
          <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <div className="min-w-0 text-left">
          <span className="dash-punch-tile__label block text-[8px] font-bold uppercase tracking-wide text-white/55">EOD</span>
          <span className="dash-punch-tile__meta block text-[11px] font-bold text-white">{busy ? '…' : 'Logout'}</span>
        </div>
      </button>
    </div>
  );
}

export function BannerPunchTiles({
  headerActions,
  liveTime,
  dateShort,
}: {
  headerActions?: ReactNode;
  liveTime?: string;
  dateShort?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const refreshToken = useAuthStore((s) => s.refreshToken);
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const {
    data,
    toggling,
    toggle,
    requestMeeting,
    requestingMeeting,
    meetingNeedsApproval,
    meetingPending,
    liveRemainingSeconds,
    activeElapsed,
    reload,
  } = useBreakPunch(true);
  const [workIn, setWorkIn] = useState(false);
  const [dayClosed, setDayClosed] = useState(false);
  const [loginTimeLabel, setLoginTimeLabel] = useState<string | undefined>();
  const [logoutTimeLabel, setLogoutTimeLabel] = useState<string | undefined>();
  const [syncing, setSyncing] = useState(false);
  const [eodLoggingOut, setEodLoggingOut] = useState(false);

  const loadWorkStatus = useCallback(async () => {
    if (!user?.id) return;
    try {
      const now = new Date();
      const monthly = await attendanceService.getMonthlyAnalytics(
        user.id,
        now.getMonth() + 1,
        now.getFullYear(),
        true,
      );
      const todayKey = todayDateKeyIst(now);
      const today = monthly.dailyBreakdown?.find((d) => d.date.slice(0, 10) === todayKey);
      const hasCheckIn = !!today?.checkInTime;
      const hasCheckOut = !!today?.checkOutTime;
      const onDuty =
        hasCheckIn &&
        !hasCheckOut &&
        (today?.status === 'present' || today?.status === 'half-day');
      setDayClosed(Boolean(today?.eodClosed));
      setWorkIn(onDuty);
      setLoginTimeLabel(today?.checkInTime);
      setLogoutTimeLabel(today?.checkOutTime);
    } catch {
      setWorkIn(false);
      setDayClosed(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const pending = peekLoginPunch();
    if (pending?.punchedIn && !pending?.dayClosed) {
      setWorkIn(true);
    }
    loadWorkStatus();
    const onRefresh = () => loadWorkStatus();
    const onLoginPunch = (e: Event) => {
      const detail = (e as CustomEvent<AttendancePunchOnLogin>).detail;
      if (detail?.punchedIn && !detail?.dayClosed) setWorkIn(true);
    };
    window.addEventListener('attendance:refresh', onRefresh);
    window.addEventListener('attendance:login-punch', onLoginPunch);
    return () => {
      window.removeEventListener('attendance:refresh', onRefresh);
      window.removeEventListener('attendance:login-punch', onLoginPunch);
    };
  }, [loadWorkStatus]);

  const onBreak = !!data.activeType;
  const activeType = data.activeType;

  const breakInfo = (type: BreakKey) => {
    if (type === 'meeting' && meetingPending && !data.meeting.isActive) {
      return { meta: 'Pending', sublabel: 'Awaiting admin approval' };
    }
    const s = data[type];
    const isLive = activeType === type && s.isActive;
    const usedSeconds = s.usedMinutes * 60 + (isLive ? activeElapsed : 0);
    const usedLabel = formatBreakDuration(usedSeconds);

    if (isLive) {
      const rem =
        liveRemainingSeconds != null ? liveRemainingSeconds : s.remainingSeconds;
      return {
        meta: `${usedLabel} used`,
        sublabel: `${formatRemainingShort(rem)} remaining`,
      };
    }

    if (s.remainingMinutes <= 0) {
      return {
        meta: `${usedLabel} used`,
        sublabel: s.usedMinutes > 0 ? 'Daily limit reached' : `Allowance ${s.hint}`,
      };
    }

    return {
      meta: `${usedLabel} used`,
      sublabel: `${s.remainingMinutes}m left`,
    };
  };

  const handleBreak = async (type: BreakKey) => {
    const s = data[type];
    if (!s.isActive && s.remainingMinutes <= 0) return;
    if (onBreak && activeType !== type) return;
    if (type === 'meeting' && meetingNeedsApproval && !s.isActive) {
      if (meetingPending) return;
      await requestMeeting();
      toast.success('Meeting request sent to admin');
      return;
    }
    await toggle(type);
  };

  const handleEndBreak = async () => {
    if (onBreak && activeType) {
      await toggle(activeType);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    await Promise.all([reload(), loadWorkStatus()]);
    setSyncing(false);
  };

  /** End-of-day: portal logout + automatic checkout (same as sidebar sign out). */
  const handleEodLogout = async () => {
    if (!workIn || eodLoggingOut) return;
    setEodLoggingOut(true);
    try {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('work-time:stash'));
      }
      try {
        await activityLogsService.track({
          action: 'LOGOUT',
          resource: 'auth',
          metadata: { reason: 'eod', source: 'quick-punch' },
        });
      } catch {
        /* non-blocking */
      }
      const rt = refreshToken ?? useAuthStore.getState().refreshToken;
      if (rt) {
        await apiClient.post('/auth/logout', { refreshToken: rt, reason: 'manual' });
      }
      clearAuth();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('attendance:refresh'));
      }
      window.location.replace('/');
    } catch {
      setEodLoggingOut(false);
    }
  };

  return (
    <div className="dash-punch-inner">
      <p className="dash-punch-meta__label">
        <Fingerprint className="h-3.5 w-3.5 shrink-0" />
        Quick punch
      </p>

      <div className="dash-punch-grid">
        {onBreak ? (
          <PunchTile
            label="End break"
            meta={activeType ? formatBreakDuration(activeElapsed) : undefined}
            sublabel="Back to work"
            tone="work"
            icon={LogIn}
            active
            busy={toggling !== null}
            onClick={handleEndBreak}
          />
        ) : dayClosed ? (
          <WorkDayClosedTile loginTime={loginTimeLabel} logoutTime={logoutTimeLabel} />
        ) : workIn ? (
          <WorkEodSplitTile
            loginTime={loginTimeLabel}
            busy={eodLoggingOut}
            onEodLogout={handleEodLogout}
          />
        ) : (
          <div
            className={cn(
              'relative flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 backdrop-blur-md dash-punch-off-duty',
              toneStyles.work.shell,
            )}
          >
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-md shadow-sm',
                toneStyles.work.icon,
              )}
            >
              <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
            </span>
            <span className="min-w-0 text-left">
              <span className="block truncate text-[10px] font-bold leading-tight text-white">Off duty</span>
              <span className="block truncate font-mono text-[8px] tabular-nums text-white/60">Use CRM login</span>
            </span>
          </div>
        )}
        <span className="dash-punch-sep" aria-hidden />
        {(['tea', 'lunch', 'meeting'] as const).map((type) => {
          const info = breakInfo(type);
          const labels = { tea: 'Tea', lunch: 'Lunch', meeting: 'Meeting' };
          const icons = { tea: Coffee, lunch: UtensilsCrossed, meeting: Users };
          const Icon = icons[type];
          return (
            <PunchTile
              key={type}
              label={labels[type]}
              meta={info.meta}
              sublabel={info.sublabel}
              tone={type}
              icon={Icon}
              active={activeType === type}
              busy={toggling === type || (type === 'meeting' && requestingMeeting)}
              disabled={
                (onBreak && activeType !== type) ||
                (type === 'meeting' && meetingPending) ||
                (!data[type].isActive && data[type].remainingMinutes <= 0)
              }
              onClick={() => handleBreak(type)}
            />
          );
        })}
      </div>

      <div className="dash-punch-meta__tools">
        {liveTime && (
          <div className="dash-punch-clock" title={dateShort}>
            <p className="dash-punch-clock__time">{liveTime}</p>
            {dateShort && <p className="dash-punch-clock__date">{dateShort}</p>}
          </div>
        )}
        {headerActions && <div className="dash-punch-meta__actions">{headerActions}</div>}
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing || toggling !== null || requestingMeeting || eodLoggingOut}
          className="dash-punch-sync"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', syncing && 'animate-spin')} />
          Sync
        </button>
      </div>
    </div>
  );
}
