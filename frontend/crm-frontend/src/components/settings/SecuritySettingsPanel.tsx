'use client';

import { Shield, Clock, LogOut, Eye } from 'lucide-react';
import { IDLE_TIMEOUT_MINUTES, IDLE_WARN_BEFORE_MINUTES } from '@/lib/constants/session';
import { SLEEP_GAP_MS } from '@/lib/auth/sleep-logout';

const ITEMS = [
  {
    icon: Clock,
    title: 'Sleep / idle sign-out',
    body: `Sign-out when: (1) PC sleep or screen lock (~${Math.round(SLEEP_GAP_MS / 1000)}s+ frozen), (2) ${IDLE_TIMEOUT_MINUTES} minutes with no mouse/keyboard. Quick tab switches under ~${Math.round(SLEEP_GAP_MS / 1000)}s do not sign you out.`,
    tone: 'amber',
  },
  {
    icon: LogOut,
    title: 'Sign out vs EOD logout',
    body: 'Sidebar Sign out pauses your session. Quick Punch EOD Logout ends the calendar day — attendance checkout is final until tomorrow.',
    tone: 'blue',
  },
  {
    icon: Eye,
    title: 'Activity tracking',
    body: 'Login, logout, and key actions are recorded for audit on employee and DB administrator accounts.',
    tone: 'green',
  },
  {
    icon: Shield,
    title: 'Password change',
    body: 'Use Change Password — all active sessions end after a password update for security.',
    tone: 'violet',
  },
];

const TONE_ICON: Record<string, string> = {
  amber: 'bg-amber-50 text-amber-700 border-amber-100',
  blue: 'bg-sky-50 text-sky-700 border-sky-100',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-100',
  violet: 'bg-violet-50 text-violet-700 border-violet-100',
};

export function SecuritySettingsPanel() {
  return (
    <div>
      <div className="st-section-head">
        <h2 className="st-section-title">Security</h2>
        <p className="st-section-sub">Session and access policies for your account</p>
      </div>

      <div className="st-policy-grid">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.title} className="st-policy-card">
              <span
                className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${TONE_ICON[item.tone]}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900">{item.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{item.body}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
