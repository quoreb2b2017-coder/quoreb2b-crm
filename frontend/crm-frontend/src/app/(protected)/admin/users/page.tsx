'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { usersService, type CreateUserPayload } from '@/lib/api/users.service';
import { Input } from '@/components/ui/Input';
import { UsersDataTable } from '@/components/admin/UsersDataTable';
import { extractApiError } from '@/lib/api/errors';
import { toast } from '@/stores/toast.store';

type RoleOption = 'db_admin' | 'employee';

const roleLabels: Record<RoleOption, string> = {
  db_admin: 'DB Administrator',
  employee: 'Employee',
};

const emptyForm = {
  email: '', password: '', firstName: '', lastName: '', employeeId: '', role: 'employee' as RoleOption,
};

export default function AdminUsersPage() {
  const router = useRouter();
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

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const openReport = (user: Record<string, unknown>) => {
    const id = String(user.id ?? user._id ?? '');
    if (id) router.push(`/admin/users/${id}/report`);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { data } = await usersService.list({ limit: 100 });
      const outer = (data as { data?: unknown })?.data;
      const list: Record<string, unknown>[] = Array.isArray(outer)
        ? outer
        : Array.isArray((outer as { data?: unknown[] })?.data)
          ? (outer as { data: Record<string, unknown>[] }).data
          : [];
      setUsers(list);
    } catch { setUsers([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadUsers(); }, []);

  const openDrawer = () => { setForm(emptyForm); setFormMsg(''); setFormErr(''); setDrawerOpen(true); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setFormErr(''); setFormMsg('');
    try {
      await usersService.create({
        email: form.email, password: form.password,
        firstName: form.firstName, lastName: form.lastName,
        roles: [form.role],
        ...(form.employeeId ? { employeeId: form.employeeId.toUpperCase() } : {}),
      } as CreateUserPayload);
      setFormMsg(`User ${form.email} created`);
      toast.success('User created', `${form.email} is ready to sign in`);
      setForm(emptyForm);
      await loadUsers();
    } catch (err: unknown) {
      const message = extractApiError(err, 'Failed to create user');
      setFormErr(message);
      toast.error('Could not create user', message);
    } finally { setSaving(false); }
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

  const handleDeleteUser = async (userId: string, name: string) => {
    if (!userId || userId === 'undefined') return;
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
  };

  const openPwModal = async (userId: string, name: string) => {
    setPwModal({ userId, name }); setPw(undefined); setShowPw(false);
    try {
      const res = await usersService.getPassword(userId);
      const raw = res.data as unknown;
      setPw(
        (raw as { data?: { password?: string | null } })?.data?.password ??
        (raw as { password?: string | null })?.password ??
        null
      );
    } catch { setPw(null); }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">

      {/* ── Page Header ── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#d4d4d4] bg-[#f3f3f3] px-4 py-2.5">
        <div>
          <h1 className="text-lg font-semibold text-slate-800">User Management</h1>
          <p className="mt-0.5 text-xs text-slate-500">Excel-style table — arrow keys to move between cells</p>
        </div>
        <button
          onClick={openDrawer}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
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
        navigationEnabled={!drawerOpen && !pwModal}
        onOpenPassword={openPwModal}
        onOpenReport={openReport}
        onToggleBlock={handleToggleBlock}
        onDelete={handleDeleteUser}
      />

      {/* ── Password Modal ── */}
      {pwModal && (
        <>
          <div onClick={() => setPwModal(null)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm pointer-events-auto overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <div>
                  <p className="font-semibold text-slate-900 text-sm">User Password</p>
                  <p className="text-xs text-slate-400 mt-0.5">{pwModal.name}</p>
                </div>
                <button onClick={() => setPwModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-5 py-4 space-y-3">
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 min-h-[48px]">
                  {pw === undefined ? (
                    <span className="text-sm text-slate-400 flex items-center gap-2">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Fetching...
                    </span>
                  ) : pw ? (
                    <>
                      <span className="font-mono text-sm text-slate-800 tracking-widest select-all flex-1">
                        {showPw ? pw : '•'.repeat(pw.length)}
                      </span>
                      <button onClick={() => setShowPw(v => !v)} className="ml-3 p-1.5 rounded hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors">
                        {showPw ? (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-slate-400 italic">Not available for this user</span>
                  )}
                </div>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                  ⚠️ Admin-only. Do not share this password.
                </p>
              </div>
              <div className="px-5 pb-4">
                <button onClick={() => setPwModal(null)} className="w-full py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium transition-colors">
                  Close
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Drawer Backdrop ── */}
      <div
        onClick={() => setDrawerOpen(false)}
        className={`fixed inset-0 bg-black/30 backdrop-blur-sm z-40 transition-opacity duration-300 ${drawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      />

      {/* ── Add User Drawer ── */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h3 className="font-semibold text-slate-900">Create New User</h3>
            <p className="text-xs text-slate-400 mt-0.5">Fill in the details below</p>
          </div>
          <button onClick={() => setDrawerOpen(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <form onSubmit={handleCreate} className="space-y-4" id="create-user-form">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Role</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as RoleOption })}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none text-sm bg-white"
              >
                {(Object.keys(roleLabels) as RoleOption[]).map((r) => (
                  <option key={r} value={r}>{roleLabels[r]}</option>
                ))}
              </select>
            </div>
            <Input label="First name" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            <Input label="Last name" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required />
            <Input label="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <Input
              label="Employee ID"
              placeholder={form.role === 'db_admin' ? 'DBA002' : 'EMP002'}
              value={form.employeeId}
              onChange={(e) => setForm({ ...form, employeeId: e.target.value.toUpperCase() })}
              required
            />
            <Input label="Password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
            {formMsg && <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">{formMsg}</p>}
            {formErr && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{formErr}</p>}
          </form>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button type="button" onClick={() => setDrawerOpen(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors">
            Cancel
          </button>
          <button type="submit" form="create-user-form" disabled={saving} className="flex-1 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium transition-colors">
            {saving ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}
