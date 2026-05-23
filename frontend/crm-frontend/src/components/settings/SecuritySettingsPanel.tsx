'use client';

import { Shield, Clock, LogOut } from 'lucide-react';
import { IDLE_TIMEOUT_MINUTES, IDLE_WARN_BEFORE_MINUTES } from '@/lib/constants/session';

const ITEMS = [
  {
    icon: Clock,
    title: 'Auto logout (idle)',
    body: `After ${IDLE_TIMEOUT_MINUTES} minutes with no activity you are signed out automatically. Warning appears ${IDLE_WARN_BEFORE_MINUTES} minute before logout.`,
  },
  {
    icon: Shield,
    title: 'Activity tracking',
    body: 'Login, logout, and page views are recorded for audit (employee and DB administrator accounts).',
  },
  {
    icon: LogOut,
    title: 'Password change',
    body: 'Use Change Password — all active sessions end after a password update.',
  },
];

export function SecuritySettingsPanel() {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Security</h2>
      <p className="mt-1 text-xs text-slate-500">Session and access policies for your account</p>

      <ul className="mt-4 space-y-0 border border-slate-300">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <li
              key={item.title}
              className="flex gap-3 border-b border-slate-200 bg-white px-3 py-3 last:border-b-0"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center border border-slate-200 bg-[#f3f3f3] text-[#217346]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-900">{item.title}</p>
                <p className="mt-0.5 text-xs text-slate-500">{item.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
