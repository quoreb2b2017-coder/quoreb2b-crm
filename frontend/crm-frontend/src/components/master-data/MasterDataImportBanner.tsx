'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import axios from 'axios';
import {
  masterDataService,
  type MasterDataSearchIndexStatus,
} from '@/lib/api/master-data.service';
import { useMasterDataImportStore } from '@/store/master-data-import.store';
import { useAuthStore } from '@/store/auth.store';

function formatEta(seconds: number | null | undefined, fallbackMinutes: number | null | undefined) {
  if (typeof seconds === 'number' && Number.isFinite(seconds) && seconds >= 0) {
    if (seconds < 60) return `~${seconds}s left`;
    const mins = Math.ceil(seconds / 60);
    return `~${mins} min left`;
  }
  if (typeof fallbackMinutes === 'number' && fallbackMinutes > 0) {
    return `~${fallbackMinutes} min estimated`;
  }
  return null;
}

export function MasterDataImportBanner() {
  const [hidden, setHidden] = useState(false);
  const [searchStatus, setSearchStatus] = useState<MasterDataSearchIndexStatus | null>(null);
  const uiPhase = useMasterDataImportStore((s) => s.uiPhase);
  const jobId = useMasterDataImportStore((s) => s.jobId);
  const progress = useMasterDataImportStore((s) => s.progress);
  const fileName = useMasterDataImportStore((s) => s.fileName);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const reindexRunning = Boolean(searchStatus?.reindex?.running);

  useEffect(() => {
    if (uiPhase === 'active') setHidden(false);
    if (reindexRunning) setHidden(false);
  }, [uiPhase, jobId, reindexRunning]);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) {
      setSearchStatus(null);
      return;
    }

    let cancelled = false;
    let intervalId: number | undefined;

    const stop = () => {
      if (intervalId != null) {
        window.clearInterval(intervalId);
        intervalId = undefined;
      }
    };

    const poll = async () => {
      const token = useAuthStore.getState().accessToken;
      if (!token || !useAuthStore.getState().isAuthenticated) {
        stop();
        return;
      }
      try {
        const status = await masterDataService.getSearchIndexStatus();
        if (!cancelled) setSearchStatus(status);
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        // Expired / logged-out — stop hammering the API
        if (status === 401 || status === 403) {
          stop();
        }
      }
    };

    void poll();
    intervalId = window.setInterval(poll, 4000);
    return () => {
      cancelled = true;
      stop();
    };
  }, [isAuthenticated, accessToken]);

  const showImport = Boolean(progress) && (uiPhase === 'active' || uiPhase === 'done');
  const showReindexOnly = !showImport && reindexRunning;
  if (hidden || (!showImport && !showReindexOnly)) return null;

  const percent = Number.isFinite(progress?.percent)
    ? Math.max(0, Math.min(100, progress!.percent))
    : 0;
  const isDone = showReindexOnly || uiPhase === 'done' || progress?.phase === 'done';
  const reindex = searchStatus?.reindex;
  const rowLabel =
    progress?.totalRows != null && progress.totalRows > 0
      ? `${(progress.rowsProcessed ?? 0).toLocaleString()} / ${progress.totalRows.toLocaleString()} rows`
      : null;
  const partLabel =
    progress?.totalParts && progress.totalParts > 1
      ? `Saving batch ${progress.partIndex ?? '?'}/${progress.totalParts}`
      : null;

  const etaLabel = formatEta(
    reindex?.etaSeconds,
    reindex?.estimatedFullMinutes ?? searchStatus?.fullReindexEtaMinutes,
  );

  let title = showReindexOnly
    ? 'Search index rebuilding'
    : isDone
      ? 'Master data import complete'
      : 'Master data import running';
  let footer = showReindexOnly
    ? `Search is partially available until rebuild finishes${etaLabel ? ` · ${etaLabel}` : ''}`
    : isDone
      ? 'Search ready — new contacts are searchable now'
      : `${partLabel ? `${partLabel} · ` : ''}${rowLabel ? `${rowLabel} · ` : ''}${percent}% — switch tabs freely; import continues on the server`;

  if ((isDone || showReindexOnly) && reindexRunning) {
    title = 'Search reindex running (automatic)';
    footer = `${reindex?.message || 'Rebuilding search index…'}${etaLabel ? ` · ${etaLabel}` : ''}`;
  } else if (isDone && reindex?.phase === 'done') {
    footer = reindex.message || 'Search ready — new contacts are searchable now';
  }

  const barPercent = reindexRunning && reindex && reindex.total > 0
    ? Math.min(100, Math.round((reindex.indexed / reindex.total) * 100))
    : percent;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[9998] mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-[#2e7ad1]/30 bg-white p-4 shadow-lg md:left-auto md:right-6">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f1fb]">
        {isDone && !reindexRunning ? (
          <span className="text-sm font-bold text-[#00a870]">✓</span>
        ) : (
          <Loader2 className="h-4 w-4 animate-spin text-[#2e7ad1]" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        {fileName && (
          <p className="truncate text-xs text-slate-500" title={fileName}>
            {fileName}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-600">
          {reindexRunning ? reindex?.message || progress?.message : progress?.message}
        </p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#2e7ad1] to-[#00d19e] transition-all duration-500"
            style={{ width: `${barPercent}%` }}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">{footer}</p>
        {searchStatus && isDone && !reindexRunning && (
          <p className="mt-1 text-[11px] text-slate-400">
            Full rebuild (only if replace/clear): ~{searchStatus.fullReindexEtaMinutes} min for{' '}
            {searchStatus.mongoRowCount.toLocaleString()} contacts
          </p>
        )}
      </div>
      <button
        type="button"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        aria-label="Hide banner"
        onClick={() => setHidden(true)}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
