'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Mail, Package, Shield, Activity, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { toast } from '@/stores/toast.store';
import type { NotificationPreferences } from '@/lib/api/notification-preferences.service';
import { useNotificationPreferencesStore } from '@/store/notification-preferences.store';

type ToggleKey = keyof NotificationPreferences;

const TOGGLES: Array<{
  key: ToggleKey;
  label: string;
  description: string;
  icon: typeof Bell;
  requiresMaster?: boolean;
}> = [
  {
    key: 'enabled',
    label: 'In-app notifications',
    description: 'Show alerts in the notification bell',
    icon: Bell,
  },
  {
    key: 'toastEnabled',
    label: 'Popup toasts',
    description: 'Brief popup when a new alert arrives',
    icon: BellOff,
    requiresMaster: true,
  },
  {
    key: 'batchAlerts',
    label: 'Batch & uploads',
    description: 'Batch shared, created, or master data updates',
    icon: Package,
    requiresMaster: true,
  },
  {
    key: 'leaveAlerts',
    label: 'Leave updates',
    description: 'Leave applied, approved, or rejected',
    icon: CalendarCheck,
    requiresMaster: true,
  },
  {
    key: 'attendanceAlerts',
    label: 'Attendance',
    description: 'Attendance marked, including late entry alerts',
    icon: Activity,
    requiresMaster: true,
  },
  {
    key: 'systemAlerts',
    label: 'System alerts',
    description: 'Important system and admin messages',
    icon: Shield,
    requiresMaster: true,
  },
  {
    key: 'activityAlerts',
    label: 'Activity',
    description: 'Team activity and workflow updates',
    icon: Activity,
    requiresMaster: true,
  },
  {
    key: 'emailAlerts',
    label: 'Email alerts',
    description: 'Send copies to email when available (coming soon)',
    icon: Mail,
    requiresMaster: true,
  },
];

function ToggleRow({
  label,
  description,
  icon: Icon,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description: string;
  icon: typeof Bell;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-3 py-3 last:border-b-0 sm:px-4">
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-[#f3f3f3] text-[#217346]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{label}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-1 h-6 w-11 shrink-0 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#217346]/40 disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-[#217346]' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function NotificationSettingsPanel() {
  const { preferences, loading, load, update } = useNotificationPreferencesStore();
  const [savingKey, setSavingKey] = useState<ToggleKey | null>(null);

  useEffect(() => {
    void load().catch(() => {
      toast.error('Could not load preferences', 'Try refreshing the page.');
    });
  }, [load]);

  const handleToggle = async (key: ToggleKey, next: boolean) => {
    setSavingKey(key);
    try {
      const patch: Partial<NotificationPreferences> = { [key]: next };
      if (key === 'enabled' && !next) {
        patch.toastEnabled = false;
      }
      await update(patch);
      toast.success('Saved', `${TOGGLES.find((t) => t.key === key)?.label ?? 'Setting'} updated`);
    } catch {
      toast.error('Save failed', 'Could not update notification preference.');
    } finally {
      setSavingKey(null);
    }
  };

  const masterOn = preferences?.enabled ?? true;

  return (
    <div className="min-w-0">
      <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Notifications</h2>
      <p className="mt-1 text-xs text-slate-500">Control in-app alerts and popup toasts</p>

      <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 sm:px-4">
        Attendance is counted <strong>late after 6:30 PM</strong>. Late entries include check-in time in
        notifications when enabled below.
      </div>

      {loading && !preferences ? (
        <div className="mt-6 flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading preferences…
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-lg border border-slate-300">
          {TOGGLES.map((item) => (
            <ToggleRow
              key={item.key}
              label={item.label}
              description={item.description}
              icon={item.icon}
              checked={preferences?.[item.key] ?? false}
              disabled={Boolean(item.requiresMaster && !masterOn && item.key !== 'enabled') || savingKey === item.key}
              onChange={(next) => void handleToggle(item.key, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
