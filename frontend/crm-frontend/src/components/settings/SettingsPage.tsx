'use client';

import { useState } from 'react';
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
import { ChangePasswordModal } from './ChangePasswordModal';
import { SystemHealthPanel } from './SystemHealthPanel';
import { AccountSettingsPanel } from './AccountSettingsPanel';
import { SecuritySettingsPanel } from './SecuritySettingsPanel';

const SETTINGS_SECTIONS = [
  { id: 'account', label: 'My Account', icon: User, description: 'Profile & role details' },
  { id: 'change-password', label: 'Change Password', icon: KeyRound, description: 'Update your password' },
  { id: 'system-health', label: 'System Health', icon: Activity, description: 'API & services status' },
  { id: 'security', label: 'Security', icon: Shield, description: 'Session & idle policy' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts preferences' },
] as const;

type SectionId = (typeof SETTINGS_SECTIONS)[number]['id'];

export function SettingsPage() {
  const panel = useAuthStore((s) => s.panel);
  const [activeSection, setActiveSection] = useState<SectionId>('account');
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

  const accent =
    panel === 'db_admin' ? 'bg-violet-600' : panel === 'employee' ? 'bg-emerald-600' : 'bg-[#217346]';

  const handleSectionChange = (id: SectionId) => {
    if (id === 'change-password') {
      setPasswordModalOpen(true);
    }
    setActiveSection(id);
  };

  return (
    <div className="flex flex-col border border-slate-300 bg-[#e8e8e8]">
      <div className={cn('border-b border-slate-300 px-4 py-2.5 text-white', accent)}>
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
          className="flex gap-0 overflow-x-auto border-b border-slate-300 bg-[#f3f3f3] lg:w-52 lg:shrink-0 lg:flex-col lg:border-b-0 lg:border-r"
          aria-label="Settings sections"
        >
          {SETTINGS_SECTIONS.map((section) => {
            const Icon = section.icon;
            const isActive = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => handleSectionChange(section.id)}
                className={cn(
                  'flex min-w-[140px] items-start gap-2 border-b border-r border-slate-200 px-3 py-2.5 text-left text-xs transition-colors lg:min-w-0 lg:border-r-0',
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

        <div className="min-w-0 flex-1 bg-white p-4 sm:p-6">
          {activeSection === 'account' && <AccountSettingsPanel />}
          {activeSection === 'system-health' && <SystemHealthPanel />}
          {activeSection === 'security' && <SecuritySettingsPanel />}
          {activeSection === 'notifications' && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Notifications</h2>
              <p className="mt-1 text-xs text-slate-500">Email and in-app alert preferences</p>
              <div className="mt-4 border border-dashed border-slate-300 bg-[#f9f9f9] px-4 py-8 text-center text-xs text-slate-500">
                Notification settings will be available in a future update.
              </div>
            </div>
          )}
          {activeSection === 'change-password' && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Change password</h2>
              <p className="mt-1 text-xs text-slate-500">
                Update your password securely. All sessions will be signed out.
              </p>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(true)}
                className="mt-4 inline-flex items-center gap-2 border border-[#217346] bg-[#217346] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1a5c38]"
              >
                <KeyRound className="h-4 w-4" />
                Open change password form
              </button>
            </div>
          )}
        </div>
      </div>

      {passwordModalOpen && (
        <ChangePasswordModal
          onClose={() => {
            setPasswordModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
