'use client';

import '@/components/batches/batches.css';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { usersService } from '@/lib/api/users.service';
import { toast } from '@/stores/toast.store';
import { extractApiError } from '@/lib/api/errors';
import { useCrmDataCleared } from '@/hooks/useCrmDataCleared';
import { BatchMonthExplorer } from '@/components/batches/BatchMonthExplorer';
import { BatchActionButton, BatchXlButton } from '@/components/batches/batch-action-buttons';
import { toastBatchShareResult } from '@/lib/batches/share-result-toast';

function Initials({ name }: { name: string }) {
  const p = name.trim().split(' ');
  return (
    <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold uppercase text-indigo-700">
      {(p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')}
    </span>
  );
}

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function AdminBatchesPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareModal, setShareModal] = useState<BatchRecord | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    setLoading(true);
    try {
      const list = await batchesService.list();
      setBatches(Array.isArray(list) ? list : []);
    } catch (e) {
      toast.error('Failed to load batches', extractApiError(e));
      setBatches([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  useCrmDataCleared(loadBatches);

  const openShareModal = async (batch: BatchRecord) => {
    setShareModal(batch);
    setSelectedUserIds(new Set(batch.sharedWith));
    setUsersLoading(true);
    try {
      const { data } = await usersService.list({ limit: 500 });
      const outer = (data as { data?: unknown })?.data;
      const list: Record<string, unknown>[] = Array.isArray(outer)
        ? outer
        : Array.isArray((outer as { data?: unknown[] })?.data)
          ? (outer as { data: Record<string, unknown>[] }).data
          : [];
      const filtered = list.filter((u) => {
        const roles = Array.isArray(u.roles) ? (u.roles as string[]) : [];
        return roles.includes('employee') || roles.includes('db_admin');
      });
      setUsers(
        filtered.map((u) => ({
          id: String(u.id ?? u._id),
          name: `${String(u.firstName)} ${String(u.lastName)}`,
          email: String(u.email),
          role: (Array.isArray(u.roles) ? (u.roles as string[])[0] : '') ?? '',
        })),
      );
    } catch {
      toast.error('Could not load users');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleShare = async () => {
    if (!shareModal) return;
    setSharing(true);
    try {
      const result = await batchesService.share(shareModal.id, Array.from(selectedUserIds));
      toastBatchShareResult(result);
      setShareModal(null);
      await loadBatches();
    } catch (e) {
      toast.error('Share failed', extractApiError(e));
    } finally {
      setSharing(false);
    }
  };

  const handleDelete = async (batch: BatchRecord) => {
    if (!confirm(`Delete batch "${batch.name}"? This cannot be undone.`)) return;
    setDeleting(batch.id);
    try {
      await batchesService.delete(batch.id);
      toast.success('Batch deleted', `"${batch.name}" removed`);
      await loadBatches();
    } catch (e) {
      toast.error('Delete failed', extractApiError(e));
    } finally {
      setDeleting(null);
    }
  };

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <BatchMonthExplorer
        batches={batches}
        loading={loading}
        title="Batches"
        subtitle="Add a year · Jan–Dec folders auto-created · batches file by creation month"
        emptyHint='Go to Master Data Upload, apply filters, then click "Create Batch"'
        renderActions={(b) => (
          <>
            <BatchActionButton onClick={() => router.push(`/admin/batches/${b.id}/team`)}>
              Team
            </BatchActionButton>
            <BatchXlButton onClick={() => router.push(`/admin/batches/${b.id}`)} />
            <BatchActionButton onClick={() => openShareModal(b)}>Share</BatchActionButton>
            <BatchActionButton
              variant="danger"
              disabled={deleting === b.id}
              onClick={() => handleDelete(b)}
            >
              {deleting === b.id ? '…' : 'Delete'}
            </BatchActionButton>
          </>
        )}
      />

      {shareModal && (
        <>
          <div className="xl-modal-backdrop" onClick={() => setShareModal(null)} />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="xl-modal pointer-events-auto">
              <div className="xl-modal-head">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="xl-modal-head-xl">
                      <span className="xl-badge xl-badge--light">XL</span>
                      <p className="font-semibold text-slate-900">Share Batch</p>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">&quot;{shareModal.name}&quot;</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShareModal(null)}
                    className="xl-btn px-2 py-1 text-base leading-none"
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="px-6 py-4">
                <p className="mb-3 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-xs leading-relaxed text-emerald-900">
                  <span className="font-semibold">Employees</span> receive an{' '}
                  <span className="font-semibold">equal, unique slice</span> of leads — no duplicate
                  rows across team members.{' '}
                  <span className="font-semibold">DB Administrators</span> receive the full batch to
                  split and assign further.
                </p>
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                    Select users
                  </p>
                  {users.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedUserIds(
                          selectedUserIds.size === users.length
                            ? new Set()
                            : new Set(users.map((u) => u.id)),
                        )
                      }
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      {selectedUserIds.size === users.length ? 'Deselect all' : 'Select all'}
                    </button>
                  )}
                </div>
                {usersLoading ? (
                  <p className="py-8 text-center text-sm text-slate-400">Loading users…</p>
                ) : users.length === 0 ? (
                  <p className="py-4 text-center text-sm text-slate-400">No users found</p>
                ) : (
                  <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                    {users.map((u) => (
                      <label
                        key={u.id}
                        className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={selectedUserIds.has(u.id)}
                          onChange={() => toggleUser(u.id)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600"
                        />
                        <Initials name={u.name} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">{u.name}</p>
                          <p className="truncate text-xs text-slate-400">{u.email}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-3 px-6 pb-5">
                <button
                  type="button"
                  onClick={() => setShareModal(null)}
                  className="xl-btn flex-1 py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={sharing}
                  className="xl-btn xl-btn--xl flex-1 py-2.5 text-sm disabled:opacity-50"
                >
                  {sharing ? 'Sharing…' : `Share (${selectedUserIds.size})`}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
