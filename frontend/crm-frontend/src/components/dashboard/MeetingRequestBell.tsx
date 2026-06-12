'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Loader2, Users, X } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import {
  breakPunchService,
  type PendingMeetingRequest,
} from '@/lib/api/break-punch.service';
import { extractApiError } from '@/lib/api/errors';
import { connectSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';
import { toast } from '@/stores/toast.store';

function formatRequestedAt(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

export function MeetingRequestBell() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const [open, setOpen] = useState(false);
  const [requests, setRequests] = useState<PendingMeetingRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [actingId, setActingId] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await breakPunchService.listPendingMeetingRequests();
      setRequests(rows);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!accessToken) return;
    const socket = connectSocket(accessToken);
    const refresh = () => void load();
    socket.on('meeting-request:pending', refresh);
    return () => {
      socket.off('meeting-request:pending', refresh);
    };
  }, [accessToken, load]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const handleReview = async (requestId: string, action: 'approve' | 'reject') => {
    setActingId(requestId);
    try {
      if (action === 'approve') {
        await breakPunchService.approveMeetingRequest(requestId);
        toast.success('Meeting approved — timer started');
      } else {
        await breakPunchService.rejectMeetingRequest(requestId);
        toast.success('Meeting request declined');
      }
      await load();
    } catch (e) {
      toast.error(extractApiError(e, 'Could not update request'));
    } finally {
      setActingId(null);
    }
  };

  const count = requests.length;

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-xl border transition-colors',
          count > 0
            ? 'border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100'
            : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50',
        )}
        title="Meeting requests"
        aria-label="Meeting requests"
      >
        <Users className="h-4 w-4" />
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-violet-600 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Meeting requests</p>
            <p className="text-xs text-slate-500">Approve to start employee meeting timer</p>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
              </div>
            ) : requests.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-400">No pending requests</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {requests.map((req) => (
                  <li key={req.id} className="px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900">{req.userName}</p>
                    <p className="truncate text-xs text-slate-500">{req.userEmail}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Requested {formatRequestedAt(req.requestedAt)}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={actingId === req.id}
                        onClick={() => void handleReview(req.id, 'approve')}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                      >
                        {actingId === req.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Check className="h-3 w-3" />
                        )}
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={actingId === req.id}
                        onClick={() => void handleReview(req.id, 'reject')}
                        className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        <X className="h-3 w-3" />
                        Decline
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
