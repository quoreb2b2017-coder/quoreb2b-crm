'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { formatRemainingShort, type BreakType } from '@/lib/api/break-punch.service';
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
    shell: 'border-emerald-300/30 bg-emerald-400/10 hover:bg-emerald-400/18',
    icon: 'bg-emerald-400/25 text-emerald-100',
    active: 'border-emerald-300/70 bg-emerald-400/30 ring-1 ring-emerald-300/50',
    dot: 'bg-emerald-300',
  },
  meeting: {
    shell: 'border-violet-300/30 bg-violet-400/10 hover:bg-violet-400/18',
    icon: 'bg-violet-400/25 text-violet-100',
    active: 'border-violet-300/70 bg-violet-400/30 ring-1 ring-violet-300/50',
    dot: 'bg-violet-300',
  },
};

function PunchTile({
  label,
  sublabel,
  tone,
  icon: Icon,
  active,
  disabled,
  busy,
  onClick,
}: {
  label: string;
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
        'group relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 backdrop-blur-md transition-all duration-200',
        'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40',
        active ? t.active : t.shell,
      )}
    >
      {active && (
        <span
          className={cn('absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full', t.dot)}
        />
      )}
      <span
        className={cn(
          'flex h-8 w-8 items-center justify-center rounded-lg shadow-sm transition-transform group-hover:scale-105',
          t.icon,
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="w-full truncate text-center text-[10px] font-bold leading-tight text-white">
        {busy ? '…' : label}
      </span>
      {sublabel && (
        <span className="w-full truncate text-center font-mono text-[9px] tabular-nums text-white/60">
          {sublabel}
        </span>
      )}
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
        'relative flex min-w-0 flex-row items-stretch overflow-hidden rounded-xl border backdrop-blur-md',
        t.shell,
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2.5">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg shadow-sm', t.icon)}>
          <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wide text-white/50">Login</span>
        <span className="w-full truncate text-center font-mono text-[10px] font-semibold tabular-nums text-white">
          {loginTime ?? '—'}
        </span>
      </div>

      <div className="w-px shrink-0 self-stretch bg-white/30" aria-hidden />

      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2.5">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg shadow-sm', t.icon)}>
          <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wide text-white/50">Logout</span>
        <span className="w-full truncate text-center font-mono text-[10px] font-semibold tabular-nums text-white">
          {logoutTime ?? '—'}
        </span>
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
        'relative flex min-w-0 flex-row items-stretch overflow-hidden rounded-xl border backdrop-blur-md',
        t.active,
      )}
    >
      <span
        className={cn('absolute right-1.5 top-1.5 z-10 h-1.5 w-1.5 animate-pulse rounded-full', t.dot)}
      />

      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2.5">
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg shadow-sm', t.icon)}>
          <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <span className="text-[8px] font-bold uppercase tracking-wide text-white/50">Login</span>
        <span className="w-full truncate text-center font-mono text-[10px] font-semibold tabular-nums text-white">
          {loginTime ?? '—'}
        </span>
      </div>

      <div className="w-px shrink-0 self-stretch bg-white/30" aria-hidden />

      <button
        type="button"
        disabled={busy}
        onClick={onEodLogout}
        className={cn(
          'flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2.5 transition-colors',
          'hover:bg-white/10 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50',
        )}
      >
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg shadow-sm', t.icon)}>
          <LogOut className="h-3.5 w-3.5" strokeWidth={2} />
        </span>
        <span className="text-[10px] font-bold leading-tight text-white">{busy ? '…' : 'EOD'}</span>
        <span className="text-[8px] font-semibold uppercase tracking-wide text-white/70">Logout</span>
      </button>
    </div>
  );
}

export function BannerPunchTiles() {
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

  const breakSublabel = (type: BreakKey) => {
    if (type === 'meeting' && meetingPending && !data.meeting.isActive) {
      return 'Pending admin';
    }
    const s = data[type];
    if (s.isActive) {
      const sec =
        activeType === type && liveRemainingSeconds != null
          ? liveRemainingSeconds
          : s.remainingSeconds;
      return formatRemainingShort(sec);
    }
    if (s.remainingMinutes <= 0) return 'Done';
    return `${s.remainingMinutes}m left`;
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
    <div className="w-full rounded-xl border border-white/15 bg-black/15 p-2.5 shadow-inner backdrop-blur-md sm:p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/55">
          <Fingerprint className="h-3.5 w-3.5 text-white/70" />
          Quick punch
        </p>
        <button
          type="button"
          onClick={handleSync}
          disabled={syncing || toggling !== null || requestingMeeting || eodLoggingOut}
          className="inline-flex items-center gap-1 rounded-lg border border-white/20 bg-white/10 px-2 py-1 text-[9px] font-semibold text-white/75 transition hover:bg-white/20 disabled:opacity-50"
        >
          <RefreshCw className={cn('h-3 w-3', syncing && 'animate-spin')} />
          Sync
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {onBreak ? (
          <PunchTile
            label="End break"
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
              'relative flex min-w-0 flex-col items-center gap-1.5 rounded-xl border px-2 py-2.5 backdrop-blur-md',
              toneStyles.work.shell,
            )}
          >
            <span
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg shadow-sm',
                toneStyles.work.icon,
              )}
            >
              <LogOut className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="w-full truncate text-center text-[10px] font-bold leading-tight text-white">
              Off duty
            </span>
            <span className="w-full truncate text-center font-mono text-[9px] tabular-nums text-white/60">
              Use CRM login
            </span>
          </div>
        )}
        <PunchTile
          label="Tea"
          sublabel={breakSublabel('tea')}
          tone="tea"
          icon={Coffee}
          active={activeType === 'tea'}
          busy={toggling === 'tea'}
          disabled={(onBreak && activeType !== 'tea') || (!data.tea.isActive && data.tea.remainingMinutes <= 0)}
          onClick={() => handleBreak('tea')}
        />
        <PunchTile
          label="Lunch"
          sublabel={breakSublabel('lunch')}
          tone="lunch"
          icon={UtensilsCrossed}
          active={activeType === 'lunch'}
          busy={toggling === 'lunch'}
          disabled={(onBreak && activeType !== 'lunch') || (!data.lunch.isActive && data.lunch.remainingMinutes <= 0)}
          onClick={() => handleBreak('lunch')}
        />
        <PunchTile
          label="Meeting"
          sublabel={breakSublabel('meeting')}
          tone="meeting"
          icon={Users}
          active={activeType === 'meeting'}
          busy={toggling === 'meeting' || requestingMeeting}
          disabled={
            (onBreak && activeType !== 'meeting') ||
            meetingPending ||
            (!data.meeting.isActive && data.meeting.remainingMinutes <= 0)
          }
          onClick={() => handleBreak('meeting')}
        />
      </div>
    </div>
  );
}
