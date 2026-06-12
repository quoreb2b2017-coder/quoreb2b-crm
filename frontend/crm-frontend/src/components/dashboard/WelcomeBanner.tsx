'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  Shield,
  Database,
  Briefcase,
  CheckCircle2,
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
import { cn } from '@/lib/utils/cn';
import { WorkTimerStrip } from '@/components/dashboard/WorkTimerStrip';
import { BannerPunchTiles } from '@/components/dashboard/BannerPunchTiles';

type PanelVariant = 'admin' | 'db_admin' | 'employee';

type DecoTile = { icon: LucideIcon; label: string };

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
    subtitle: 'CRM control center — users, master data, batches & analytics',
    Icon: Shield,
    shell: 'bg-gradient-to-br from-[#143d28] via-[#1a5c38] to-[#0f3d2e]',
    accentBar: 'bg-gradient-to-r from-amber-400 to-amber-300',
    badge: 'bg-white/12 text-white ring-1 ring-white/20',
    badgeText: 'text-white/85',
    glow: 'bg-emerald-400/15',
    gridLine: 'border-white/[0.08]',
    statusDot: 'bg-emerald-300',
    decoTiles: [
      { icon: Users, label: 'Users' },
      { icon: Upload, label: 'Master data' },
      { icon: Layers, label: 'Batches' },
      { icon: BarChart3, label: 'Analytics' },
    ],
  },
  db_admin: {
    roleLabel: 'Database Administrator',
    subtitle: 'Database operations — batches, master data & team assignments',
    Icon: Database,
    shell: 'bg-gradient-to-br from-[#3b1578] via-[#5b21b6] to-[#4c1d95]',
    accentBar: 'bg-gradient-to-r from-violet-300 to-purple-300',
    badge: 'bg-white/12 text-white ring-1 ring-white/20',
    badgeText: 'text-white/85',
    glow: 'bg-violet-400/15',
    gridLine: 'border-white/[0.08]',
    statusDot: 'bg-violet-200',
    decoTiles: [
      { icon: Database, label: 'Master DB' },
      { icon: Layers, label: 'Batches' },
      { icon: Share2, label: 'Assign' },
      { icon: Activity, label: 'Logs' },
    ],
  },
  employee: {
    roleLabel: 'Employee',
    subtitle: 'Your workspace — assigned batches, leads & activity',
    Icon: Briefcase,
    shell: 'bg-gradient-to-br from-[#065f46] via-[#047857] to-[#0d9488]',
    accentBar: 'bg-gradient-to-r from-teal-300 to-emerald-300',
    badge: 'bg-white/12 text-white ring-1 ring-white/20',
    badgeText: 'text-white/85',
    glow: 'bg-teal-400/15',
    gridLine: 'border-white/[0.08]',
    statusDot: 'bg-teal-200',
    decoTiles: [
      { icon: Layers, label: 'Batches' },
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
  return now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
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
                className="flex flex-col items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-1.5 py-2 backdrop-blur-sm"
              >
                <TileIcon className="h-3.5 w-3.5 text-white/90" strokeWidth={2} />
                <span className="text-center text-[9px] font-semibold text-white/75">{tile.label}</span>
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

  const dateShort = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });

  const empId = user?.employeeId;

  return (
    <div className="animate-fade-in">
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl shadow-xl ring-1 ring-black/10',
          c.shell,
        )}
      >
        <div className={cn('h-1 w-full', c.accentBar)} />

        <div
          className="pointer-events-none absolute inset-0 opacity-30"
          style={{
            backgroundImage: `
              linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '28px 28px',
          }}
        />
        <div className={cn('pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full blur-3xl', c.glow)} />

        <div className="relative z-10 flex flex-col gap-3 p-4 sm:p-5">
          {/* Header row */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div
                className={cn(
                  'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-sm font-bold text-white shadow-lg',
                  'border-white/20 bg-black/20 backdrop-blur-sm',
                )}
              >
                {initials(user?.firstName, user?.lastName, user?.email)}
              </div>
              <div className="min-w-0">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider',
                      c.badge,
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {c.roleLabel}
                  </span>
                  {empId && (
                    <span className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/70">
                      {empId}
                    </span>
                  )}
                </div>
                <h2 className="text-base font-semibold leading-tight text-white sm:text-lg">
                  {timeGreeting()}, {name}
                </h2>
                <p className={cn('mt-0.5 line-clamp-1 text-[11px]', c.badgeText)}>
                  {subtitleOverride ?? c.subtitle}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              {toolbar}
              <div className="hidden text-right sm:block">
                <p className="font-mono text-base font-semibold tabular-nums text-white">{liveTime}</p>
                <p className="text-[10px] text-white/55">{dateShort}</p>
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                <span className="relative flex h-1.5 w-1.5">
                  <span className={cn('absolute h-full w-full animate-ping rounded-full opacity-50', c.statusDot)} />
                  <span className={cn('relative h-1.5 w-1.5 rounded-full', c.statusDot)} />
                </span>
                <CheckCircle2 className="h-3 w-3" />
                Signed in
              </div>
            </div>
          </div>

          {/* Quick punch — full width */}
          {showWorkTimer ? (
            <BannerPunchTiles />
          ) : (
            <BannerDecor variant={variant} MainIcon={Icon} tiles={c.decoTiles} />
          )}

          {/* Work timer */}
          {showWorkTimer && (
            <div className="border-t border-white/10 pt-3">
              <WorkTimerStrip />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
