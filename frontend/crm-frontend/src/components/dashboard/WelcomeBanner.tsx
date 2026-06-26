'use client';

import './dashboard.css';

import { WORKSPACE_TIMEZONE } from '@/lib/constants/workspace-timezone';
import { useEffect, useState, type ReactNode } from 'react';
import {
  Shield,
  Database,
  Briefcase,
  Users,
  Layers,
  BarChart3,
  Activity,
  Upload,
  Share2,
  ClipboardList,
  type LucideIcon,
} from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { WorkTimerStrip } from '@/components/dashboard/WorkTimerStrip';
import { BannerPunchTiles } from '@/components/dashboard/BannerPunchTiles';

type PanelVariant = 'admin' | 'db_admin' | 'employee';

type DecoTile = { icon: LucideIcon; label: string };

const bannerShell = 'bg-[#2e7ad1]';
const bannerShared = {
  shell: bannerShell,
  accentBar: 'bg-white/20',
  badge: 'bg-white/12 text-white ring-1 ring-white/20',
  badgeText: 'text-white/85',
  glow: 'bg-white/10',
  gridLine: 'border-white/[0.08]',
  statusDot: 'bg-white/80',
};

const config: Record<
  PanelVariant,
  {
    roleLabel: string;
    subtitle: string;
    Icon: typeof Shield;
    shell: string;
    accentBar: string;
    badge: string;
    badgeText: string;
    glow: string;
    gridLine: string;
    statusDot: string;
    decoTiles: DecoTile[];
  }
> = {
  admin: {
    roleLabel: 'Super Admin',
    subtitle: 'Your command center — manage teams, data, and performance in one place.',
    Icon: Shield,
    ...bannerShared,
    decoTiles: [
      { icon: Users, label: 'Users' },
      { icon: Upload, label: 'Master data' },
      { icon: Layers, label: 'All campaigns' },
      { icon: BarChart3, label: 'Analytics' },
    ],
  },
  db_admin: {
    roleLabel: 'Database Administrator',
    subtitle: 'Keep campaigns and master data flowing — your team is counting on you.',
    Icon: Database,
    ...bannerShared,
    decoTiles: [
      { icon: Database, label: 'Master DB' },
      { icon: Layers, label: 'All campaigns' },
      { icon: Share2, label: 'Assign' },
      { icon: Activity, label: 'Logs' },
    ],
  },
  employee: {
    roleLabel: 'Employee',
    subtitle: 'Stay on top of your leads, hours, and breaks — you’ve got this.',
    Icon: Briefcase,
    ...bannerShared,
    decoTiles: [
      { icon: Layers, label: 'My campaign' },
      { icon: ClipboardList, label: 'Leads' },
      { icon: Activity, label: 'Activity' },
      { icon: Briefcase, label: 'Tasks' },
    ],
  },
};

function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function initials(first?: string, last?: string, email?: string) {
  const a = first?.trim()?.[0] ?? '';
  const b = last?.trim()?.[0] ?? '';
  if (a || b) return `${a}${b}`.toUpperCase();
  return (email?.[0] ?? 'U').toUpperCase();
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const liveTime = now.toLocaleTimeString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
  });
  const dateShort = now.toLocaleDateString('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
  return { liveTime, dateShort };
}

function BannerDecor({
  variant,
  MainIcon,
  tiles,
}: {
  variant: PanelVariant;
  MainIcon: LucideIcon;
  tiles: DecoTile[];
}) {
  return (
    <div className="hidden min-h-[72px] flex-1 lg:flex lg:justify-end">
      <div className="relative z-[1] flex w-full max-w-[320px] flex-col gap-2 self-center">
        <div className="grid grid-cols-4 gap-1.5">
          {tiles.map((tile) => {
            const TileIcon = tile.icon;
            return (
              <div
                key={tile.label}
                className="dash-deco-tile"
              >
                <TileIcon className="h-3.5 w-3.5 text-[#2e7ad1]" strokeWidth={2} />
                <span className="text-center text-[9px] font-semibold text-slate-600">{tile.label}</span>
              </div>
            );
          })}
        </div>
        <MainIcon className="absolute -right-4 top-1/2 h-16 w-16 -translate-y-1/2 text-white/[0.06]" />
      </div>
    </div>
  );
}

interface WelcomeBannerProps {
  variant: PanelVariant;
  subtitleOverride?: string;
  /** e.g. dashboard refresh button */
  toolbar?: ReactNode;
}

const WORK_TIMER_VARIANTS: PanelVariant[] = ['employee', 'admin', 'db_admin'];

export function WelcomeBanner({ variant, subtitleOverride, toolbar }: WelcomeBannerProps) {
  const user = useAuthStore((s) => s.user);
  const name = user?.firstName ?? user?.email?.split('@')[0] ?? 'there';
  const c = config[variant];
  const Icon = c.Icon;
  const { liveTime, dateShort } = useLiveClock();
  const showWorkTimer = WORK_TIMER_VARIANTS.includes(variant);
  const subtitle = subtitleOverride ?? c.subtitle;
  const empId = user?.employeeId;

  return (
    <div className="dash-section animate-fade-in">
      <div className="dash-welcome-stack">
        <div className="dash-welcome-card dash-banner-shine relative overflow-hidden">
          <div className="dash-welcome-accent" />
          <div className="relative z-10 flex items-center justify-between gap-2 p-2 sm:p-2.5 lg:px-3 lg:py-2">
            <div className="flex min-w-0 items-center gap-2">
              <div className="dash-avatar">
                {initials(user?.firstName, user?.lastName, user?.email)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <h2 className="text-sm font-bold leading-tight text-slate-900 sm:text-base">
                    {timeGreeting()}, {name}!
                  </h2>
                  <span className="inline-flex items-center gap-0.5 rounded bg-[#e8f1fb] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#2568b8]">
                    <Icon className="h-2.5 w-2.5" />
                    {c.roleLabel}
                  </span>
                  {empId && (
                    <span className="hidden rounded bg-slate-100 px-1 py-0.5 font-mono text-[8px] text-slate-500 sm:inline">
                      {empId}
                    </span>
                  )}
                </div>
                <p className="dash-welcome-sub mt-0.5 max-w-xl text-[11px] leading-snug text-slate-500 sm:text-xs">
                  {subtitle}
                </p>
              </div>
            </div>
            {!showWorkTimer && (
              <div className="flex shrink-0 items-center gap-1.5">
                {toolbar}
                <div className="dash-clock-widget">
                  <p className="dash-clock-time">{liveTime}</p>
                  <p className="dash-clock-date">{dateShort}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {showWorkTimer ? (
          <div className="dash-welcome-work">
            <div className="dash-punch-strip">
              <BannerPunchTiles
                headerActions={toolbar}
                liveTime={liveTime}
                dateShort={dateShort}
              />
            </div>
            <WorkTimerStrip variant="light" compact className="dash-work-timer--compact" />
          </div>
        ) : (
          <div className="dash-welcome-card p-1.5">
            <BannerDecor variant={variant} MainIcon={Icon} tiles={c.decoTiles} />
          </div>
        )}
      </div>
    </div>
  );
}
