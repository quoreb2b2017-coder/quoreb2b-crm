'use client';

import './settings.css';

import { useMemo, useState } from 'react';
import {
  KeyRound,
  Activity,
  User,
  Shield,
  Bell,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/store/auth.store';
import { ChangePasswordForm } from './ChangePasswordForm';
import { SystemHealthPanel } from './SystemHealthPanel';
import { AccountSettingsPanel } from './AccountSettingsPanel';
import { SecuritySettingsPanel } from './SecuritySettingsPanel';
import { NotificationSettingsPanel } from './NotificationSettingsPanel';

const SETTINGS_SECTIONS = [
  { id: 'account', label: 'My Account', icon: User, description: 'Profile & role details', adminOnly: false },
  { id: 'change-password', label: 'Change Password', icon: KeyRound, description: 'Update your password', adminOnly: false },
  { id: 'system-health', label: 'System Health', icon: Activity, description: 'API & services status', adminOnly: true },
  { id: 'security', label: 'Security', icon: Shield, description: 'Session & idle policy', adminOnly: true },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts preferences', adminOnly: false },
] as const;

type SectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

const CRM_THEME = {
  gradient: 'bg-[#2e7ad1]',
  accent: '#2e7ad1',
};

const PANEL_THEME: Record<string, { gradient: string; accent: string }> = {
  admin: CRM_THEME,
  db_admin: CRM_THEME,
  employee: CRM_THEME,
};

function userInitials(firstName?: string, lastName?: string, email?: string) {
  const name = [firstName, lastName].filter(Boolean).join(' ').trim();
  if (name) {
    const parts = name.split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email?.slice(0, 2).toUpperCase() ?? '?';
}

export function SettingsPage() {
  const panel = useAuthStore((s) => s.panel);
  const user = useAuthStore((s) => s.user);
  const isAdmin = panel === 'admin';
  const [activeSection, setActiveSection] = useState<SectionId>('account');

  const visibleSections = useMemo(
    () => SETTINGS_SECTIONS.filter((section) => isAdmin || !section.adminOnly),
    [isAdmin],
  );

  const theme = PANEL_THEME[panel ?? 'admin'] ?? PANEL_THEME.admin;
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'User';

  return (
    <div
      className="st-root mx-auto w-full max-w-5xl"
      style={{ '--st-accent': theme.accent } as React.CSSProperties}
    >
      <div className="st-shell">
        {/* Hero */}
        <div className={cn('st-hero px-5 py-5 text-white sm:px-6', theme.gradient)}>
          <div className="st-hero-content flex items-center gap-4">
            <span className="st-hero-icon flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
              <Settings className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">Settings</h1>
              <p className="mt-0.5 text-sm text-white/80">
                {displayName} — account, security & preferences
              </p>
            </div>
            <span className="st-profile-avatar hidden shrink-0 sm:flex" style={{ backgroundColor: theme.accent }}>
              {userInitials(user?.firstName, user?.lastName, user?.email)}
            </span>
          </div>
        </div>

        <div className="st-layout">
          <nav className="st-nav" aria-label="Settings sections">
            {visibleSections.map((section, idx) => {
              const Icon = section.icon;
              const isActive = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => setActiveSection(section.id)}
                  style={{ animationDelay: `${idx * 40}ms` }}
                  className={cn(
                    'st-nav-item',
                    isActive && 'st-nav-item--active',
                    isActive ? 'text-[var(--st-accent)]' : 'text-slate-600',
                  )}
                >
                  <Icon
                    className={cn(
                      'mt-0.5 h-4 w-4 shrink-0 transition-colors',
                      isActive ? 'text-[var(--st-accent)]' : 'text-slate-400',
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{section.label}</span>
                    <span className="mt-0.5 hidden text-[10px] font-normal text-slate-500 lg:block">
                      {section.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="st-content">
            <div key={activeSection} className="st-panel">
              {activeSection === 'account' && <AccountSettingsPanel />}
              {activeSection === 'system-health' && isAdmin && <SystemHealthPanel />}
              {activeSection === 'security' && isAdmin && <SecuritySettingsPanel />}
              {activeSection === 'notifications' && <NotificationSettingsPanel />}
              {activeSection === 'change-password' && <ChangePasswordForm variant="inline" />}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
