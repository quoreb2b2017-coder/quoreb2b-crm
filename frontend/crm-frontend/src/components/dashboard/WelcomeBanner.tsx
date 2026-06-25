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
    subtitle: 'CRM control center — users, master data, campaigns & analytics',
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
    subtitle: 'Database operations — campaigns, master data & team assignments',
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
    subtitle: 'Your workspace — assigned campaigns, leads & activity',
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
  return now.toLocaleTimeString('en-US', { timeZone: WORKSPACE_TIMEZONE,  hour: '2-digit', minute: '2-digit' });
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
  const liveTime = useLiveClock();
  const showWorkTimer = WORK_TIMER_VARIANTS.includes(variant);

  const dateShort = new Date().toLocaleDateString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const empId = user?.employeeId;

  return (
    <div className="dash-section animate-fade-in">
      <div className="dash-welcome-card dash-banner-shine relative overflow-hidden">
        <div className="dash-welcome-accent" />

        <div className="relative z-10 flex flex-col gap-1 p-2 sm:p-2.5">
          <div className="flex flex-wrap items-center justify-between gap-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="dash-avatar">
                {initials(user?.firstName, user?.lastName, user?.email)}
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1">
                  <h2 className="text-sm font-bold leading-none tracking-tight text-slate-900">
                    {timeGreeting()}, {name}
                  </h2>
                  <span className="inline-flex items-center gap-0.5 rounded bg-[#e8f1fb] px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-[#2568b8]">
                    <Icon className="h-2.5 w-2.5" />
                    {c.roleLabel}
                  </span>
                  {empId && (
                    <span className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[8px] text-slate-500">
                      {empId}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1">
              {toolbar}
              <div className="dash-clock-widget hidden md:block">
                <p className="dash-clock-time">{liveTime}</p>
                <p className="dash-clock-date">{dateShort}</p>
              </div>
            </div>
          </div>

          {showWorkTimer ? (
            <div className="dash-punch-strip">
              <BannerPunchTiles />
            </div>
          ) : (
            <BannerDecor variant={variant} MainIcon={Icon} tiles={c.decoTiles} />
          )}

          {showWorkTimer && (
            <WorkTimerStrip variant="light" compact />
          )}
        </div>
      </div>
    </div>
  );
}
