'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usersService, type CreateUserPayload } from '@/lib/api/users.service';
import { Input } from '@/components/ui/Input';
import { UsersDataTable } from '@/components/admin/UsersDataTable';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';
import { useAuthStore } from '@/store/auth.store';

type RoleOption = 'super_admin' | 'db_admin' | 'employee';

const roleLabels: Record<RoleOption, string> = {
  super_admin: 'Super Admin',
  db_admin: 'DB Administrator',
  employee: 'Employee',
};

const emptyForm = {
  email: '',
  password: '',
  firstName: '',
  lastName: '',
  employeeId: '',
  role: 'employee' as RoleOption,
};

export default function AdminUsersPage() {
  const router = useRouter();
  const currentRoles = useAuthStore((s) => s.user?.roles ?? []);
  const currentUserId = useAuthStore((s) => s.user?.id ?? '');
  const isSuperAdmin =
    currentRoles.includes('super_admin') || currentRoles.includes('admin');

  const roleOptions = useMemo<RoleOption[]>(
    () => (isSuperAdmin ? ['super_admin', 'db_admin', 'employee'] : ['db_admin', 'employee']),
    [isSuperAdmin],
  );

  const [users, setUsers] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState('');
  const [formErr, setFormErr] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [pwModal, setPwModal] = useState<{ userId: string; name: string } | null>(null);
  const [pw, setPw] = useState<string | null | undefined>(undefined);
  const [showPw, setShowPw] = useState(false);
  const [deleteModal, setDeleteModal] = useState<{
    userId: string;
    name: string;
    role: string;
    emailHint?: string;
  } | null>(null);
  const [deleteOtp, setDeleteOtp] = useState('');
  const [deleteSending, setDeleteSending] = useState(false);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const openReport = (user: Record<string, unknown>) => {
    const id = String(user.id ?? user._id ?? '');
    if (id) router.push(`/admin/users/${id}/report`);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const list = await usersService.listParsed({ limit: 200 });
      setUsers(list);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const openDrawer = () => {
    setForm({ ...emptyForm, role: roleOptions[0] });
    setFormMsg('');
    setFormErr('');
    setDrawerOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFormErr('');
    setFormMsg('');
    try {
      const roles =
        form.role === 'super_admin' ? ['super_admin', 'admin'] : [form.role];

      await usersService.create({
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        roles,
        ...(form.role !== 'super_admin' && form.employeeId
          ? { employeeId: form.employeeId.toUpperCase() }
          : {}),
      } as CreateUserPayload);
      setFormMsg(`User ${form.email} created`);
      toast.success('User created', `${form.email} is ready to sign in`);
      setForm({ ...emptyForm, role: roleOptions[0] });
      await loadUsers();
    } catch (err: unknown) {
      const message = extractApiError(err, 'Failed to create user');
      setFormErr(message);
      toast.error('Could not create user', message);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleBlock = async (userId: string, currentlyActive: boolean) => {
    if (!userId || userId === 'undefined') return;
    setActionLoading(`block-${userId}`);
    try {
      await usersService.setStatus(userId, !currentlyActive);
      toast.success(
        currentlyActive ? 'User blocked' : 'User unblocked',
        currentlyActive ? 'They cannot sign in until unblocked.' : 'Sign-in access restored.',
      );
      await loadUsers();
    } catch (err: unknown) {
      toast.error('Status update failed', extractApiError(err, 'Failed to update status'));
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteUser = async (userId: string, name: string, role: string) => {
    if (!userId || userId === 'undefined') return;
    const needsOtp = role === 'super_admin' || role === 'admin';
    if (!needsOtp) {
      if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
      setActionLoading(`delete-${userId}`);
      try {
        await usersService.delete(userId);
        toast.success('User deleted', `"${name}" was removed.`);
        await loadUsers();
      } catch (err: unknown) {
        toast.error('Delete failed', extractApiError(err, 'Failed to delete user'));
      } finally {
        setActionLoading(null);
      }
      return;
    }

    setDeleteModal({ userId, name, role });
    setDeleteOtp('');
    setDeleteSending(true);
    try {
      const res = await usersService.sendDeleteOtp(userId);
      const raw = res.data as unknown;
      const payload =
        (raw as { data?: { email?: string; message?: string } })?.data ??
        (raw as { email?: string; message?: string });
      setDeleteModal({
        userId,
        name,
        role,
        emailHint: payload?.email,
      });
      toast.success('OTP sent', payload?.message || 'Check your email for the delete code');
    } catch (err: unknown) {
      setDeleteModal(null);
      toast.error('OTP failed', extractApiError(err, 'Could not send delete OTP'));
    } finally {
      setDeleteSending(false);
    }
  };

  const confirmDeleteWithOtp = async () => {
    if (!deleteModal) return;
    if (!deleteOtp.trim()) {
      toast.error('OTP required', 'Enter the code sent to your email');
      return;
    }
    setActionLoading(`delete-${deleteModal.userId}`);
    try {
      await usersService.delete(deleteModal.userId, deleteOtp.trim());
      toast.success('User deleted', `"${deleteModal.name}" was removed.`);
      setDeleteModal(null);
      setDeleteOtp('');
      await loadUsers();
    } catch (err: unknown) {
      toast.error('Delete failed', extractApiError(err, 'Failed to delete user'));
    } finally {
      setActionLoading(null);
    }
  };

  const openPwModal = async (userId: string, name: string) => {
    if (!isSuperAdmin) return;
    setPwModal({ userId, name });
    setPw(undefined);
    setShowPw(false);
    try {
      const res = await usersService.getPassword(userId);
      const raw = res.data as unknown;
      setPw(
        (raw as { data?: { password?: string | null } })?.data?.password ??
          (raw as { password?: string | null })?.password ??
          null,
      );
    } catch {
      setPw(null);
    }
  };

  const needsEmployeeId = form.role !== 'super_admin';

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-[#e6e6e6]">
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#b4b4b4] bg-[#2e7ad1] px-4 py-2 text-white shadow-sm">
        <div className="flex items-center gap-3">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-white/20 text-[10px] font-bold">
            XL
          </span>
          <div>
            <h1 className="text-sm font-semibold tracking-tight">User Management</h1>
            <p className="text-[11px] text-white/75">Arrow keys · Tab · Enter on action cells</p>
          </div>
        </div>
        <button
          onClick={openDrawer}
          className="flex items-center gap-2 rounded-sm border border-white/30 bg-white px-3.5 py-1.5 text-sm font-semibold text-[#2e7ad1] shadow-sm transition-all duration-150 hover:bg-emerald-50 active:scale-[0.98]"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Add User
        </button>
      </div>

      <UsersDataTable
        className="min-h-0 flex-1"
        users={users}
        loading={loading}
        actionLoading={actionLoading}
        navigationEnabled={!drawerOpen && !pwModal && !deleteModal}
        isSuperAdmin={isSuperAdmin}
        currentUserId={currentUserId}
        onOpenPassword={openPwModal}
        onOpenReport={openReport}
        onToggleBlock={handleToggleBlock}
        onDelete={handleDeleteUser}
      />

      {pwModal && (
        <>
          <div onClick={() => setPwModal(null)} className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <p className="text-sm font-semibold text-slate-900">User Password</p>
                  <p className="mt-0.5 text-xs text-slate-400">{pwModal.name}</p>
                </div>
                <button
                  onClick={() => setPwModal(null)}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100"
                >
                  <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="space-y-3 px-5 py-4">
                <div className="flex min-h-[48px] items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  {pw === undefined ? (
                    <span className="flex items-center gap-2 text-sm text-slate-400">
                      <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Fetching...
                    </span>
                  ) : pw ? (
                    <>
                      <span className="flex-1 select-all font-mono text-sm tracking-widest text-slate-800">
                        {showPw ? pw : '•'.repeat(pw.length)}
                      </span>
                      <button
                        onClick={() => setShowPw((v) => !v)}
                        className="ml-3 rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
                      >
                        {showPw ? 'Hide' : 'Show'}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs italic text-slate-500">
                      Not available — set password again (Create User / Change Password)
                    </span>
                  )}
                </div>
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Only Super Admin can view passwords. Older accounts created before this
                  update may need a password reset once to become viewable.
                </p>
              </div>
              <div className="px-5 pb-4">
                <button
                  onClick={() => setPwModal(null)}
                  className="w-full rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {deleteModal && (
        <>
          <div
            onClick={() => !actionLoading && setDeleteModal(null)}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
          />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="pointer-events-auto w-full max-w-sm overflow-hidden rounded-xl bg-white shadow-xl">
              <div className="border-b border-slate-100 px-5 py-4">
                <p className="text-sm font-semibold text-slate-900">Delete Super Admin</p>
                <p className="mt-0.5 text-xs text-slate-400">
                  Confirm deletion of <span className="font-medium text-slate-700">{deleteModal.name}</span>
                  {deleteModal.emailHint ? ` — OTP sent to ${deleteModal.emailHint}` : ''}
                </p>
              </div>
              <div className="space-y-3 px-5 py-4">
                <Input
                  label="OTP code"
                  value={deleteOtp}
                  onChange={(e) => setDeleteOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="6-digit code"
                  autoFocus
                />
                <p className="text-xs text-slate-500">
                  {deleteSending
                    ? 'Sending OTP…'
                    : 'Enter the OTP emailed to your Super Admin inbox to permanently delete this account.'}
                </p>
              </div>
              <div className="flex gap-2 px-5 pb-4">
                <button
                  type="button"
                  disabled={Boolean(actionLoading)}
                  onClick={() => setDeleteModal(null)}
                  className="flex-1 rounded-lg bg-slate-100 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={Boolean(actionLoading) || deleteSending || deleteOtp.trim().length < 4}
                  onClick={() => void confirmDeleteWithOtp()}
                  className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {actionLoading ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      <div
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 z-40 bg-black/30 backdrop-blur-sm transition-opacity duration-300 ${drawerOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
      />

      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="font-semibold text-slate-900">Create New User</h3>
            <p className="mt-0.5 text-xs text-slate-400">Fill in the details below</p>
          </div>
          <button
            onClick={() => setDrawerOpen(false)}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form onSubmit={handleCreate} className="space-y-4" id="create-user-form">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as RoleOption })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#2e7ad1]/40"
              >
                {roleOptions.map((r) => (
                  <option key={r} value={r}>
                    {roleLabels[r]}
                  </option>
                ))}
              </select>
            </div>
            <Input
              label="First name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
            />
            <Input
              label="Last name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
            <Input
              label="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            {needsEmployeeId && (
              <Input
                label="Employee ID"
                placeholder={form.role === 'db_admin' ? 'DBA001' : 'EMP001'}
                value={form.employeeId}
                onChange={(e) => setForm({ ...form, employeeId: e.target.value.toUpperCase() })}
                required
              />
            )}
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={8}
            />
            {formMsg && (
              <p className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-[#2e7ad1]">
                {formMsg}
              </p>
            )}
            {formErr && (
              <p className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
                {formErr}
              </p>
            )}
          </form>
        </div>
        <div className="flex gap-3 border-t border-slate-100 px-6 py-4">
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-user-form"
            disabled={saving}
            className="flex-1 rounded-xl bg-[#2e7ad1] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2568b8] disabled:opacity-60"
          >
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}
