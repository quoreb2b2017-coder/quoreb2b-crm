'use client';

import { User, Mail, BadgeCheck, Shield, LayoutGrid } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { formatRoleLabel } from '@/lib/api/activity-logs.service';
import { cn } from '@/lib/utils/cn';

function avatarHue(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hues = ['#2e7ad1', '#2e75b6', '#7c3aed', '#0d9488', '#c2410c'];
  return hues[Math.abs(hash) % hues.length];
}

const ROLE_BADGE: Record<string, string> = {
  super_admin: 'bg-slate-700 text-white',
  admin: 'bg-violet-100 text-[#2568b8] ring-1 ring-violet-200',
  db_admin: 'bg-sky-100 text-sky-800 ring-1 ring-sky-200',
  employee: 'bg-[#e8f1fb] text-[#2568b8] ring-1 ring-[#cfe0f5]',
};

export function AccountSettingsPanel() {
  const user = useAuthStore((s) => s.user);
  const panel = useAuthStore((s) => s.panel);

  if (!user) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || '—';
  const primaryRole = user.roles?.[0] ?? '—';
  const initials = name !== '—'
    ? name.split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const rows = [
    { icon: User, label: 'Full name', value: name },
    { icon: Mail, label: 'Email', value: user.email },
    { icon: BadgeCheck, label: 'Employee ID', value: user.employeeId ?? '—' },
    { icon: Shield, label: 'Role', value: formatRoleLabel(primaryRole), isRole: true },
    { icon: LayoutGrid, label: 'Portal', value: panel ?? '—' },
  ];

  return (
    <div className="st-account-body">
      <div className="st-profile-card">
        <span
          className="st-profile-avatar shrink-0"
          style={{ backgroundColor: avatarHue(name) }}
        >
          {initials}
        </span>
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-slate-900">{name}</p>
          <p className="truncate text-sm text-slate-500">{user.email}</p>
          <span
            className={cn(
              'st-badge mt-2',
              ROLE_BADGE[primaryRole] ?? 'bg-slate-100 text-slate-700 ring-1 ring-slate-200',
            )}
          >
            {formatRoleLabel(primaryRole)}
          </span>
        </div>
      </div>

      <div className="st-card st-info-grid">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.label} className="st-info-row">
              <span className="st-info-icon">
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{row.label}</dt>
                <dd className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                  {row.isRole ? (
                    <span
                      className={cn(
                        'st-badge',
                        ROLE_BADGE[primaryRole] ?? 'bg-slate-100 text-slate-700',
                      )}
                    >
                      {row.value}
                    </span>
                  ) : (
                    row.value
                  )}
                </dd>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
