'use client';

import { User, Mail, BadgeCheck, Shield } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { formatRoleLabel } from '@/lib/api/activity-logs.service';

export function AccountSettingsPanel() {
  const user = useAuthStore((s) => s.user);
  const panel = useAuthStore((s) => s.panel);

  if (!user) return null;

  const name = [user.firstName, user.lastName].filter(Boolean).join(' ') || '—';
  const primaryRole = user.roles?.[0] ?? '—';

  const rows = [
    { icon: User, label: 'Full name', value: name },
    { icon: Mail, label: 'Email', value: user.email },
    { icon: BadgeCheck, label: 'Employee ID', value: user.employeeId ?? '—' },
    { icon: Shield, label: 'Role', value: formatRoleLabel(primaryRole) },
    { icon: Shield, label: 'Portal', value: panel ?? '—' },
  ];

  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">My account</h2>
      <p className="mt-1 text-xs text-slate-500">Your profile information on this portal</p>

      <dl className="mt-4 space-y-0 border border-slate-300">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div
              key={row.label}
              className="flex items-center gap-3 border-b border-slate-200 bg-white px-3 py-2.5 last:border-b-0"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-slate-200 bg-[#f3f3f3] text-[#217346]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <dt className="text-[10px] font-semibold uppercase text-slate-500">{row.label}</dt>
                <dd className="text-sm font-medium text-slate-900">{row.value}</dd>
              </div>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
