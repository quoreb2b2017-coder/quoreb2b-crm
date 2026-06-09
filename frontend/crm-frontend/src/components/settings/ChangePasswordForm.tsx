'use client';

import { useEffect, useState } from 'react';
import { Lock, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authService } from '@/lib/api/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { cn } from '@/lib/utils/cn';

interface ChangePasswordFormProps {
  /** Render inside modal shell (mobile bottom sheet) */
  variant?: 'inline' | 'modal';
  onClose?: () => void;
}

export function ChangePasswordForm({ variant = 'inline', onClose }: ChangePasswordFormProps) {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (variant !== 'modal') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [variant]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr('');
    setMsg('');

    if (newPassword !== confirmPassword) {
      const message = 'New passwords do not match';
      setErr(message);
      toast.warning('Check your passwords', message);
      return;
    }
    if (newPassword.length < 8) {
      const message = 'New password must be at least 8 characters';
      setErr(message);
      toast.warning('Password too short', message);
      return;
    }

    setLoading(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setMsg('Password updated. Redirecting to sign in...');
      toast.success('Password updated', 'Signing you out for security…');
      setTimeout(() => {
        clearAuth();
        window.location.href = '/';
      }, 1500);
    } catch (e: unknown) {
      const message = extractApiError(e, 'Failed to change password');
      setErr(message);
      toast.error('Could not update password', message);
    } finally {
      setLoading(false);
    }
  };

  const formBody = (
    <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
        <p className="rounded-lg border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs leading-relaxed text-amber-800 sm:text-sm">
          After updating, you will be signed out on all devices for security.
        </p>

        <div className="grid gap-4 sm:gap-5">
          <Input
            label="Current password"
            type="password"
            icon={Lock}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="text-base sm:text-sm"
          />
          <Input
            label="New password"
            type="password"
            icon={Lock}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="text-base sm:text-sm"
          />
          <Input
            label="Confirm new password"
            type="password"
            icon={Lock}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="text-base sm:text-sm"
          />
        </div>

        {msg && (
          <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700">
            {msg}
          </p>
        )}
        {err && (
          <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-600">
            {err}
          </p>
        )}
      </div>

      <div
        className={cn(
          'shrink-0 border-t border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-6',
          'pb-[max(1rem,env(safe-area-inset-bottom))]',
        )}
      >
        <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="order-2 w-full rounded-lg border border-slate-200 bg-white py-3 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:order-1 sm:w-auto sm:min-w-[120px] sm:py-2.5"
            >
              Cancel
            </button>
          )}
          <Button
            type="submit"
            disabled={loading}
            fullWidth
            className="order-1 w-full py-3 sm:order-2 sm:w-auto sm:min-w-[160px] sm:py-2.5"
          >
            {loading ? 'Updating...' : 'Update password'}
          </Button>
        </div>
      </div>
    </form>
  );

  if (variant === 'inline') {
    return (
      <div className="mx-auto w-full max-w-xl">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-start gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white px-4 py-4 sm:px-6">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 sm:text-lg">Change password</h2>
              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                Use at least 8 characters. Avoid reusing old passwords.
              </p>
            </div>
          </div>
          {formBody}
        </div>
      </div>
    );
  }

  return formBody;
}
