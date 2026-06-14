'use client';

import '@/components/batches/batches.css';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { batchesService, type BatchRecord } from '@/lib/api/batches.service';
import { usersService } from '@/lib/api/users.service';
import { toast } from '@/stores/toast.store';
import { extractApiError } from '@/lib/api/errors';
import { useAuthStore } from '@/store/auth.store';
import { useCrmDataCleared } from '@/hooks/useCrmDataCleared';
import { BatchMonthExplorer } from '@/components/batches/BatchMonthExplorer';
import { BatchActionButton, BatchXlButton } from '@/components/batches/batch-action-buttons';
import { toastBatchShareResult } from '@/lib/batches/share-result-toast';

interface UserOption {
  id: string;
  name: string;
  email: string;
  role: string;
}

export default function SharedBatchesPage({
  role,
  canShareOwn = false,
}: {
  role: 'employee' | 'db_admin';
  /** DB admin: share batches they created with employees */
  canShareOwn?: boolean;
}) {
  const router = useRouter();
  const { user } = useAuthStore();
  const basePath = role === 'db_admin' ? '/db-admin' : '/employee';
  const [batches, setBatches] = useState<BatchRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareModal, setShareModal] = useState<BatchRecord | null>(null);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());

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

  const isOwner = (b: BatchRecord) => user?.id && b.createdBy === user.id;

  const openShareModal = async (batch: BatchRecord) => {
    setShareModal(batch);
    setSelectedUserIds(new Set(batch.sharedWith));
    setUsersLoading(true);
    try {
      const list = await usersService.listTeamMembers();
      const members = Array.isArray(list) ? list : [];
      setUsers(
        members.map((u) => ({
          id: u.id,
          name: `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() || u.email,
          email: u.email,
          role: u.roles?.[0] ?? 'employee',
        })),
      );
      if (members.length === 0) {
        toast.info('No employees yet', 'Ask admin to create employee users in Users');
      }
    } catch (e) {
      toast.error('Could not load team', extractApiError(e));
      setUsers([]);
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

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const subtitle =
    role === 'db_admin'
      ? 'Add year · Jan–Dec folders · admin-shared and your batches'
      : 'Add year · Jan–Dec folders · batches shared with you';

  const emptyHint =
    role === 'db_admin'
      ? 'Ask admin to share a batch, or create one from a shared admin batch'
      : 'When admin shares a batch, it appears in the month it was created';

  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <BatchMonthExplorer
        batches={batches}
        loading={loading}
        title={role === 'db_admin' ? 'Batches' : 'My Batches'}
        subtitle={subtitle}
        emptyTitle={role === 'db_admin' ? 'No batches yet' : 'No batches shared yet'}
        emptyHint={emptyHint}
        renderActions={(b) => {
          const own = isOwner(b);
          return (
            <>
              {role === 'db_admin' && (
                <BatchActionButton onClick={() => router.push(`${basePath}/batches/${b.id}/team`)}>
                  Team
                </BatchActionButton>
              )}
              {canShareOwn && own && (
                <BatchActionButton onClick={() => openShareModal(b)}>Share</BatchActionButton>
              )}
              {role === 'db_admin' && !own && (
                <span className="px-1 text-[10px] text-amber-800">Admin</span>
              )}
              <BatchXlButton onClick={() => router.push(`${basePath}/batches/${b.id}`)} />
            </>
          );
        }}
      />

      {shareModal && (
        <>
          <div className="xl-modal-backdrop" onClick={() => setShareModal(null)} />
          <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="xl-modal pointer-events-auto">
              <div className="xl-modal-head">
                <div className="xl-modal-head-xl">
                  <span className="xl-badge xl-badge--light">XL</span>
                  <p className="font-semibold text-slate-900">Share with team</p>
                </div>
                <p className="text-xs text-slate-500">{shareModal.name}</p>
                <p className="mt-2 rounded-lg border border-violet-100 bg-violet-50/80 px-2.5 py-2 text-[11px] leading-relaxed text-violet-900">
                  Each selected <span className="font-semibold">employee</span> gets an equal unique
                  portion of leads — no duplicates between team members.
                </p>
              </div>
              <div className="max-h-56 overflow-y-auto px-5 py-3">
                {usersLoading ? (
                  <p className="py-4 text-sm text-slate-500">Loading users…</p>
                ) : users.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500">No team members found.</p>
                ) : (
                  users.map((u) => (
                    <label
                      key={u.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedUserIds.has(u.id)}
                        onChange={() => toggleUser(u.id)}
                      />
                      <span className="text-sm text-slate-700">
                        {u.name} <span className="text-xs text-slate-400">({u.email})</span>
                      </span>
                    </label>
                  ))
                )}
              </div>
              <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
                <button
                  type="button"
                  onClick={() => setShareModal(null)}
                  className="xl-btn flex-1 py-2 text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleShare}
                  disabled={sharing}
                  className="xl-btn xl-btn--xl flex-1 py-2 text-sm disabled:opacity-50"
                >
                  {sharing ? 'Sharing…' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
