'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, Loader2, Mail, Package, Shield, Activity, CalendarCheck } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Switch } from '@/components/ui/Switch';
import { toast } from '@/stores/toast.store';
import type { NotificationPreferences } from '@/lib/api/notification-preferences.service';
import { useNotificationPreferencesStore } from '@/store/notification-preferences.store';
import { ATTENDANCE_ON_TIME_LABEL } from '@/lib/attendance/late-attendance';

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
    label: 'Campaigns & uploads',
    description: 'Campaign shared, created, or master data updates',
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
  loading,
  onChange,
}: {
  label: string;
  description: string;
  icon: typeof Bell;
  checked: boolean;
  disabled?: boolean;
  loading?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 border-b border-slate-100 bg-white px-3 py-3.5 transition-colors duration-200 last:border-b-0 sm:px-5 sm:py-4',
        !disabled && 'hover:bg-slate-50/90',
        disabled && !loading && 'opacity-60',
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3 sm:gap-4">
        <span
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all duration-300',
            checked
              ? 'border-emerald-200 bg-gradient-to-br from-emerald-50 to-white text-[#2e7ad1] shadow-sm shadow-emerald-100/80'
              : 'border-slate-200 bg-slate-50 text-slate-400',
          )}
        >
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900">{label}</p>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide transition-colors duration-300',
                checked
                  ? 'bg-emerald-100 text-[#2e7ad1]'
                  : 'bg-slate-100 text-slate-500',
              )}
            >
              {checked ? 'On' : 'Off'}
            </span>
          </div>
          <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{description}</p>
        </div>
      </div>
      <Switch
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        loading={loading}
        aria-label={`${label} — ${checked ? 'on' : 'off'}`}
        className="mt-0.5"
      />
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
      <div className="st-section-head">
        <h2 className="st-section-title">Notifications</h2>
        <p className="st-section-sub">Control in-app alerts and popup toasts</p>
      </div>

      <div className="mb-4 rounded-xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/90 to-white px-4 py-3 text-xs leading-relaxed text-[#2568b8] shadow-sm">
        Attendance is counted <strong>late after {ATTENDANCE_ON_TIME_LABEL}</strong> Eastern. Late entries include
        check-in time in notifications when enabled below.
      </div>

      {loading && !preferences ? (
        <div className="st-card flex items-center justify-center gap-2 py-14 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-[var(--st-accent,#2e7ad1)]" />
          Loading preferences…
        </div>
      ) : (
        <div className="st-card">
          {TOGGLES.map((item) => (
            <ToggleRow
              key={item.key}
              label={item.label}
              description={item.description}
              icon={item.icon}
              checked={preferences?.[item.key] ?? false}
              loading={savingKey === item.key}
              disabled={Boolean(item.requiresMaster && !masterOn && item.key !== 'enabled') || savingKey === item.key}
              onChange={(next) => void handleToggle(item.key, next)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
