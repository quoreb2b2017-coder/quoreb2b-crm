'use client';

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

export function SettingsPage() {
  const panel = useAuthStore((s) => s.panel);
  const isAdmin = panel === 'admin';
  const [activeSection, setActiveSection] = useState<SectionId>('account');

  const visibleSections = useMemo(
    () => SETTINGS_SECTIONS.filter((section) => isAdmin || !section.adminOnly),
    [isAdmin],
  );

  const accent =
    panel === 'db_admin' ? 'bg-violet-600' : panel === 'employee' ? 'bg-emerald-600' : 'bg-[#217346]';

  const handleSectionChange = (id: SectionId) => {
    setActiveSection(id);
  };

  const showAdminAttendance =
    isAdmin && (activeSection === 'system-health' || activeSection === 'security');

  return (
    <div className="flex min-h-0 flex-col border border-slate-300 bg-[#e8e8e8]">
      <div className={cn('border-b border-slate-300 px-3 py-2.5 text-white sm:px-4', accent)}>
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 opacity-90" />
          <div>
            <p className="text-sm font-semibold">Settings</p>
            <p className="text-[11px] text-white/80">Account, security, and system status</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:items-stretch">
        <nav
          className="flex gap-0 overflow-x-auto border-b border-slate-300 bg-[#f3f3f3] lg:w-56 lg:shrink-0 lg:flex-col lg:overflow-x-visible lg:border-b-0 lg:border-r"
          aria-label="Settings sections"
        >
          {visibleSections.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionChange(section.id)}
                className={cn(
                  'flex min-w-[120px] shrink-0 items-start gap-2 border-b border-r border-slate-200 px-3 py-2.5 text-left text-xs transition-colors sm:min-w-[140px] lg:min-w-0 lg:shrink lg:border-r-0',
                  isActive
                    ? 'bg-white font-semibold text-[#217346] ring-1 ring-inset ring-[#217346]/30'
                    : 'text-slate-600 hover:bg-white/80',
                )}
              >
                <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', isActive ? 'text-[#217346]' : 'text-slate-400')} />
                <span>
                  <span className="block">{section.label}</span>
                  <span className="mt-0.5 hidden text-[10px] font-normal text-slate-500 lg:block">
                    {section.description}
                  </span>
                </span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 overflow-x-hidden bg-white p-3 sm:p-4 md:p-6">
          {activeSection === 'account' && <AccountSettingsPanel />}
          {activeSection === 'system-health' && isAdmin && <SystemHealthPanel />}
          {activeSection === 'security' && isAdmin && <SecuritySettingsPanel />}
          {activeSection === 'notifications' && <NotificationSettingsPanel />}
          {activeSection === 'change-password' && <ChangePasswordForm variant="inline" />}

        </div>
      </div>
    </div>
  );
}
