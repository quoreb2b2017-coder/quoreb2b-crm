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

const ROLE_LABELS: Record<string, string> = {
  admin: 'Super Admin',
  db_admin: 'Database Administrator',
  employee: 'Employee',
};

const ROLE_HERO: Record<string, string> = {
  admin: 'Manage your account, security policies, and system health.',
  db_admin: 'Your profile, password, and notification preferences.',
  employee: 'Your profile, password, and notification preferences.',
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
  const roleLabel = ROLE_LABELS[panel ?? 'employee'] ?? 'User';
  const heroLine = ROLE_HERO[panel ?? 'employee'] ?? ROLE_HERO.employee;
  const displayName = [user?.firstName, user?.lastName].filter(Boolean).join(' ').trim() || user?.email || 'User';
  const activeMeta = visibleSections.find((s) => s.id === activeSection);

  return (
    <div
      className="st-page"
      style={{ '--st-accent': theme.accent } as React.CSSProperties}
    >
      <div className="st-root w-full">
        <div className="st-shell">
          <div className="st-hero">
            <div className="st-hero-content flex items-center gap-3 sm:gap-4">
              <span className="st-hero-icon">
                <Settings className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1>Settings</h1>
                  <span className="st-hero-badge">{roleLabel}</span>
                </div>
                <p className="st-hero-sub">
                  {displayName} — {heroLine}
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
                      isActive ? 'text-[var(--st-accent)]' : 'text-slate-700',
                    )}
                  >
                    <span className="st-nav-icon">
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium leading-tight">{section.label}</span>
                      <span className="st-nav-desc hidden md:block">{section.description}</span>
                    </span>
                  </button>
                );
              })}
            </nav>

            <div className="st-content">
              {activeMeta && (
                <div className="st-content-head">
                  <p className="st-content-head__label">Settings</p>
                  <h2 className="st-content-head__title">{activeMeta.label}</h2>
                  <p className="st-section-sub mt-1">{activeMeta.description}</p>
                </div>
              )}
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
    </div>
  );
}
