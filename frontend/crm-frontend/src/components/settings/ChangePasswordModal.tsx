'use client';

import { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { authService } from '@/lib/api/auth.service';
import { useAuthStore } from '@/store/auth.store';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';

interface ChangePasswordModalProps {
  onClose: () => void;
}

export function ChangePasswordModal({ onClose }: ChangePasswordModalProps) {
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

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

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
        <div
          className="pointer-events-auto flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-none sm:rounded-2xl"
          role="dialog"
          aria-labelledby="change-password-title"
        >
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Lock className="h-5 w-5" />
              </span>
              <div>
                <h2 id="change-password-title" className="text-lg font-semibold text-slate-900">
                  Change password
                </h2>
                <p className="text-xs text-slate-500">All sessions will be signed out</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto px-4 py-5 sm:px-6">
            <Input
              label="Current password"
              type="password"
              icon={Lock}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              autoComplete="current-password"
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
            />

            {msg && (
              <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {msg}
              </p>
            )}
            {err && (
              <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {err}
              </p>
            )}

            <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={onClose}
                className="w-full rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 sm:flex-1"
              >
                Cancel
              </button>
              <Button type="submit" disabled={loading} className="w-full sm:flex-1">
                {loading ? 'Updating...' : 'Update password'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
