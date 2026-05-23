'use client';

import { useEffect, useState } from 'react';
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
    shell: 'border-slate-300 bg-gradient-to-br from-[#1a5c38] via-[#217346] to-[#2d8f5c]',
    accentBar: 'bg-amber-400/90',
    badge: 'bg-white/15 text-white ring-1 ring-white/25',
    badgeText: 'text-white/90',
    glow: 'bg-emerald-300/20',
    gridLine: 'border-white/[0.06]',
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
    shell: 'border-slate-300 bg-gradient-to-br from-[#4c1d95] via-[#6d28d9] to-[#5b21b6]',
    accentBar: 'bg-violet-300/90',
    badge: 'bg-white/15 text-white ring-1 ring-white/25',
    badgeText: 'text-white/90',
    glow: 'bg-violet-300/15',
    gridLine: 'border-white/[0.06]',
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
    shell: 'border-slate-300 bg-gradient-to-br from-[#047857] via-[#059669] to-[#0d9488]',
    accentBar: 'bg-teal-300/90',
    badge: 'bg-white/15 text-white ring-1 ring-white/25',
    badgeText: 'text-white/90',
    glow: 'bg-teal-300/20',
    gridLine: 'border-white/[0.06]',
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
  const bars = [42, 68, 55, 82, 48, 74, 61];

  return (
    <div className="relative hidden min-h-[72px] flex-1 lg:flex lg:justify-end">
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-full max-w-[280px] items-center justify-center">
        <svg viewBox="0 0 200 200" className="h-full w-full max-h-[100px] opacity-90" aria-hidden>
          <circle cx="100" cy="100" r="88" fill="none" className="stroke-white/15" strokeWidth="1" />
          <circle cx="100" cy="100" r="64" fill="none" className="stroke-white/15" strokeWidth="1" strokeDasharray="4 6" />
          <circle cx="100" cy="100" r="40" fill="none" className="stroke-white/15" strokeWidth="1" />
        </svg>
        <MainIcon
          className="absolute right-[18%] h-14 w-14 text-white/[0.12]"
          strokeWidth={1.25}
          aria-hidden
        />
      </div>

      <div className="relative z-[1] flex w-full max-w-[320px] flex-col gap-2 self-center">
        <div className="grid grid-cols-4 gap-1.5">
          {tiles.map((tile) => {
            const TileIcon = tile.icon;
            return (
              <div
                key={tile.label}
                className="flex flex-col items-center gap-1 rounded border border-white/20 bg-white/10 px-1.5 py-2 backdrop-blur-sm transition-colors hover:bg-white/15"
              >
                <TileIcon className="h-3.5 w-3.5 text-white/90" strokeWidth={2} />
                <span className="text-center text-[9px] font-semibold leading-tight text-white/80">
                  {tile.label}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-end justify-between gap-3 rounded border border-white/20 bg-black/10 px-3 py-2 backdrop-blur-md">
          <div className="min-w-0">
            <p className="text-[9px] font-bold uppercase tracking-wider text-white/50">
              {variant === 'admin' ? 'CRM pulse' : variant === 'db_admin' ? 'Ops overview' : 'Your pipeline'}
            </p>
            <div className="mt-1.5 flex h-8 items-end gap-0.5">
              {bars.map((h, i) => (
                <div
                  key={i}
                  className="w-2 rounded-sm bg-white/30 transition-all"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
          <div className="hidden shrink-0 border-l border-white/15 pl-3 sm:block">
            <p className="text-[9px] uppercase tracking-wide text-white/45">Secure session</p>
            <p className="mt-0.5 text-[11px] font-semibold text-white">Encrypted</p>
          </div>
        </div>
      </div>
    </div>
  );
}

interface WelcomeBannerProps {
  variant: PanelVariant;
  subtitleOverride?: string;
}

const WORK_TIMER_VARIANTS: PanelVariant[] = ['employee', 'admin', 'db_admin'];

export function WelcomeBanner({ variant, subtitleOverride }: WelcomeBannerProps) {
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
    <div
      className={cn(
        'relative overflow-hidden border shadow-sm animate-fade-in',
        c.shell,
      )}
    >
      <div className={cn('h-1 w-full', c.accentBar)} />

      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.04) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.04) 1px, transparent 1px)
          `,
          backgroundSize: '24px 24px',
        }}
      />
      <div className={cn('pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full blur-3xl', c.glow)} />
      <div className="pointer-events-none absolute -bottom-20 left-1/4 h-40 w-40 rounded-full bg-black/10 blur-2xl" />

      <div className="relative z-10 flex flex-col gap-3 px-4 py-4 md:px-5">
        {/* Row 1 — identity, decor, clock */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
          <div className="flex min-w-0 items-center gap-4 lg:max-w-[42%] lg:shrink-0">
            <div
              className={cn(
                'flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border text-sm font-bold tracking-tight text-white shadow-md',
                c.gridLine,
                'border-white/20 bg-black/15 backdrop-blur-sm',
              )}
              aria-hidden
            >
              {initials(user?.firstName, user?.lastName, user?.email)}
            </div>

            <div className="min-w-0">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                    c.badge,
                  )}
                >
                  <Icon className="h-3 w-3 opacity-90" />
                  {c.roleLabel}
                </span>
                {empId && (
                  <span className={cn('font-mono text-[10px] font-medium', c.badgeText)}>
                    {empId}
                  </span>
                )}
              </div>

              <h2 className="text-lg font-semibold leading-tight tracking-tight text-white sm:text-xl">
                {timeGreeting()}, {name}
              </h2>
              <p className={cn('mt-1 line-clamp-2 text-xs leading-relaxed sm:text-[13px]', c.badgeText)}>
                {subtitleOverride ?? c.subtitle}
              </p>
            </div>
          </div>

          <BannerDecor variant={variant} MainIcon={Icon} tiles={c.decoTiles} />

          <div className="flex shrink-0 flex-wrap items-center gap-2 lg:ml-auto lg:justify-end">
            <div className="flex flex-col gap-0.5 sm:items-end">
              <p className="font-mono text-lg font-semibold tabular-nums leading-none text-white">
                {liveTime}
              </p>
              <p className="text-[11px] font-medium text-white/70">{dateShort}</p>
            </div>

            <div
              className={cn(
                'inline-flex items-center gap-2 rounded border px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md',
                'border-white/20 bg-white/10',
              )}
            >
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
                    c.statusDot,
                  )}
                />
                <span className={cn('relative inline-flex h-2 w-2 rounded-full', c.statusDot)} />
              </span>
              <CheckCircle2 className="h-3.5 w-3.5 text-white/90" />
              <span>Signed in</span>
            </div>
          </div>
        </div>

        {/* Row 2 — work timer full width (not clipped by side column) */}
        {showWorkTimer && (
          <div className="w-full min-w-0 border-t border-white/10 pt-3">
            <WorkTimerStrip />
          </div>
        )}
      </div>
    </div>
  );
}
