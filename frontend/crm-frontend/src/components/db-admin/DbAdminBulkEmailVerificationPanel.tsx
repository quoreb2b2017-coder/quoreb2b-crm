'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  HelpCircle,
  Inbox,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  Sparkles,
  Trash2,
  Upload,
  Eye,
} from 'lucide-react';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';
import { parseSpreadsheetFile } from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  bulkEmailVerificationService,
  type EmailVerificationBatch,
  type BatchStatus,
  type EmailVerificationRecord,
  type EmailVerificationStatus,
  type ProspectRow,
} from '@/lib/api/bulk-email-verification.service';
import { extractApiError } from '@/lib/api/errors';
import { useCrmDataCleared } from '@/hooks/useCrmDataCleared';
import { toast } from '@/stores/toast.store';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/store/auth.store';
import {
  COMPANY_HEADER_KEYS,
  DOMAIN_HEADER_KEYS,
  EMAIL_HEADER_KEYS,
  FIRST_NAME_HEADER_KEYS,
  LAST_NAME_HEADER_KEYS,
  matchHeader,
  resolveProspectDomain,
  sanitizeEmailInput,
} from '@/lib/email/email-upload.util';

const ACCEPT = '.csv,.xlsx,.xls';

const PROSPECT_HEADERS = [
  'First Name',
  'Last Name',
  'Company Name',
  'Company Domain',
  'Email',
] as const;

type PendingUpload = {
  fileName: string;
  prospects: ProspectRow[];
  headers: string[];
  rows: string[][];
};

type FilePreview = {
  title: string;
  headers: string[];
  rows: string[][];
  totalRows: number;
};

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const STATUS_LABEL: Record<BatchStatus, string> = {
  uploaded: 'Ready',
  pending: 'Queued',
  processing: 'Running',
  completed: 'Complete',
  failed: 'Failed',
};

const STATUS_BADGE: Record<BatchStatus, string> = {
  uploaded: 'bg-violet-100 text-violet-800',
  pending: 'bg-slate-100 text-slate-700',
  processing: 'bg-sky-100 text-sky-800',
  completed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
};

const RECORD_STATUS: Record<EmailVerificationStatus, string> = {
  valid: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-200',
  likely_valid: 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-200',
  catch_all: 'bg-amber-50 text-amber-900 ring-1 ring-inset ring-amber-200',
  risky: 'bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-200',
  invalid: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
  unknown: 'bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-200',
};

const METRIC_ACCENT: Record<
  EmailVerificationStatus,
  { card: string; border: string; label: string; dot: string; icon: typeof CheckCircle2 }
> = {
  valid: {
    card: 'bg-emerald-50/80',
    border: 'border-emerald-200',
    label: 'text-emerald-800',
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  likely_valid: {
    card: 'bg-green-50/80',
    border: 'border-green-200',
    label: 'text-green-800',
    dot: 'bg-green-500',
    icon: Sparkles,
  },
  catch_all: {
    card: 'bg-amber-50/80',
    border: 'border-amber-200',
    label: 'text-amber-900',
    dot: 'bg-amber-500',
    icon: Inbox,
  },
  risky: {
    card: 'bg-orange-50/80',
    border: 'border-orange-200',
    label: 'text-orange-800',
    dot: 'bg-orange-500',
    icon: ShieldAlert,
  },
  invalid: {
    card: 'bg-red-50/80',
    border: 'border-red-200',
    label: 'text-red-800',
    dot: 'bg-red-500',
    icon: AlertCircle,
  },
  unknown: {
    card: 'bg-slate-50/80',
    border: 'border-slate-200',
    label: 'text-slate-700',
    dot: 'bg-slate-400',
    icon: HelpCircle,
  },
};

const STATUS_FILTER_OPTIONS: { value: EmailVerificationStatus; label: string }[] = [
  { value: 'valid', label: 'Valid' },
  { value: 'likely_valid', label: 'Likely valid' },
  { value: 'catch_all', label: 'Catch-all' },
  { value: 'risky', label: 'Risky' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'unknown', label: 'Unknown' },
];

const STATUS_METRIC_OPTIONS: Array<{
  label: string;
  status: EmailVerificationStatus;
  getCount: (batch: EmailVerificationBatch) => number;
}> = [
  { label: 'Valid', status: 'valid', getCount: (b) => b.verifiedCount ?? 0 },
  { label: 'Likely valid', status: 'likely_valid', getCount: (b) => b.likelyValidCount ?? 0 },
  { label: 'Catch-all', status: 'catch_all', getCount: (b) => b.catchAllCount ?? 0 },
  { label: 'Risky', status: 'risky', getCount: (b) => b.riskyCount ?? 0 },
  { label: 'Invalid', status: 'invalid', getCount: (b) => b.invalidCount ?? 0 },
  { label: 'Unknown', status: 'unknown', getCount: (b) => b.unknownCount ?? 0 },
];

const DEFAULT_STATUS_FILTERS: EmailVerificationStatus[] = [
  'valid',
  'likely_valid',
  'catch_all',
  'invalid',
  'unknown',
  'risky',
];

function mapRowsToProspects(headers: string[], rows: string[][]): ProspectRow[] {
  const idx = {
    firstName: headers.findIndex((h) => matchHeader(h, FIRST_NAME_HEADER_KEYS)),
    lastName: headers.findIndex((h) => matchHeader(h, LAST_NAME_HEADER_KEYS)),
    companyName: headers.findIndex((h) => matchHeader(h, COMPANY_HEADER_KEYS)),
    domain: headers.findIndex((h) => matchHeader(h, DOMAIN_HEADER_KEYS)),
    email: headers.findIndex((h) => matchHeader(h, EMAIL_HEADER_KEYS)),
  };

  if (idx.firstName < 0 || idx.lastName < 0) {
    throw new Error('Required columns: First Name and Last Name');
  }
  if (idx.domain < 0 && idx.email < 0) {
    throw new Error(
      'Add Company Domain and/or Email — need First Name, Last Name, plus domain or email',
    );
  }

  return rows
    .map((row) => {
      const firstName = (row[idx.firstName] ?? '').trim();
      const lastName = (row[idx.lastName] ?? '').trim();
      const companyName = idx.companyName >= 0 ? (row[idx.companyName] ?? '').trim() : '';
      const emailRaw = idx.email >= 0 ? sanitizeEmailInput(row[idx.email] ?? '') : '';
      const domainRaw = idx.domain >= 0 ? (row[idx.domain] ?? '').trim() : '';
      const domain = resolveProspectDomain(domainRaw, companyName, emailRaw);

      const prospect: ProspectRow = {
        firstName,
        lastName,
        companyName,
        domain,
      };
      if (emailRaw) prospect.email = emailRaw;
      return prospect;
    })
    .filter((r) => r.firstName && r.lastName && r.domain);
}

function batchPeriod(batch: EmailVerificationBatch) {
  const date = batch.createdAt ? new Date(batch.createdAt) : new Date();
  return {
    month: date.getMonth() + 1,
    year: date.getFullYear(),
  };
}

function formatBatchDate(value?: string) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-US', { timeZone: WORKSPACE_TIMEZONE, 
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatStatus(status: EmailVerificationStatus) {
  return status.replace(/_/g, ' ');
}

/** User-facing check result — hides raw SMTP / port-25 diagnostics. */
function friendlyCheckLabel(
  response: string | null | undefined,
  status: EmailVerificationStatus,
): string {
  const r = (response ?? '').toLowerCase();
  if (status === 'valid') {
    if (r.includes('smtp_accepted') || /\b250\b/.test(r)) return 'Mailbox confirmed';
    return 'Valid';
  }
  if (status === 'likely_valid') {
    if (r.includes('smtp_251') || /\b251\b/.test(r)) return 'Likely (SMTP 251)';
    return 'Likely valid';
  }
  if (status === 'catch_all' || r.includes('catch_all')) return 'Catch-all';
  if (r.includes('verify_mode:provided_full') || r.includes('provided')) {
    if (status === 'invalid') return 'Incorrect';
  }
  if (status === 'risky') return 'Risky';
  if (status === 'invalid') return 'Invalid';
  if (status === 'unknown') {
    if (
      r.includes('port25') ||
      r.includes('mailbox_unverified') ||
      r.includes('connection_timeout') ||
      r.includes('connection_failed')
    ) {
      return 'Mailbox unverified';
    }
  }
  if (!response) return '—';
  if (r.includes('format_only')) return 'Format OK';
  if (r.includes('smtp_probe_disabled') || r.includes('mx_only')) {
    return 'Mailbox unverified';
  }
  if (r.includes('no_mx') || r.includes('domain_not_found') || r.includes('dns_error')) {
    return 'No mail server';
  }
  if (r.includes('disposable')) return 'Disposable';
  return '—';
}

function shellBtn(className?: string) {
  return cn(
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50',
    className,
  );
}

function scoreTone(score: number): string {
  if (score >= 95) return 'bg-emerald-100 text-emerald-800 ring-emerald-200';
  if (score >= 80) return 'bg-green-100 text-green-800 ring-green-200';
  if (score >= 70) return 'bg-amber-100 text-amber-900 ring-amber-200';
  if (score >= 55) return 'bg-slate-100 text-slate-700 ring-slate-200';
  return 'bg-red-100 text-red-800 ring-red-200';
}

function statusFilterLabel(selected: EmailVerificationStatus[]) {
  if (!selected.length) return 'All statuses';
  if (selected.length === 1) {
    return STATUS_FILTER_OPTIONS.find((o) => o.value === selected[0])?.label ?? selected[0];
  }
  return `${selected.length} statuses`;
}

function VerificationStatusFilter({
  value,
  onChange,
  disabled,
}: {
  value: EmailVerificationStatus[];
  onChange: (next: EmailVerificationStatus[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (status: EmailVerificationStatus) => {
    onChange(
      value.includes(status)
        ? value.filter((s) => s !== status)
        : [...value, status],
    );
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-expanded={open}
        onClick={() => !disabled && setOpen((o) => !o)}
        className={cn(
          'inline-flex min-w-[10rem] items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50',
          open && 'border-emerald-600 ring-2 ring-emerald-500/20',
        )}
      >
        <span className="truncate">{statusFilterLabel(value)}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-slate-400', open && 'rotate-180')}
        />
      </button>
      <div
        className={cn(
          'absolute left-0 z-50 mt-1.5 min-w-[12rem] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl',
          open ? 'block' : 'hidden',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-3 py-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Filter status
          </span>
          <button
            type="button"
            className="rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-50"
            onClick={() => onChange([...DEFAULT_STATUS_FILTERS])}
          >
            Reset all
          </button>
        </div>
        <ul className="max-h-56 overflow-y-auto py-1">
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const active = value.includes(opt.value);
            const accent = METRIC_ACCENT[opt.value];
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    'flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors hover:bg-slate-50',
                    active && 'bg-emerald-50/60',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      active
                        ? 'border-emerald-600 bg-emerald-600 text-white'
                        : 'border-slate-300 bg-white',
                    )}
                  >
                    {active ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', accent.dot)} />
                  <span className={cn('font-medium', active ? accent.label : 'text-slate-700')}>
                    {opt.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-[10px] text-slate-500">
          Export includes only checked statuses.
        </div>
      </div>
    </div>
  );
}

export function DbAdminBulkEmailVerificationPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canDownload = useAuthStore(
    (s) => s.hasRole('super_admin') || s.hasRole('db_admin'),
  );
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [batches, setBatches] = useState<EmailVerificationBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [records, setRecords] = useState<EmailVerificationRecord[]>([]);
  const [recordPage, setRecordPage] = useState(1);
  const [recordTotal, setRecordTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [statusFilters, setStatusFilters] = useState<EmailVerificationStatus[]>(
    () => [...DEFAULT_STATUS_FILTERS],
  );
  const [minScore, setMinScore] = useState<number | ''>('');
  const [loadError, setLoadError] = useState('');
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null);
  const [filePreview, setFilePreview] = useState<FilePreview | null>(null);
  const [previewLoadingId, setPreviewLoadingId] = useState<string | null>(null);
  const hasLoadedRef = useRef(false);

  const selectedBatch = useMemo(
    () => batches.find((b) => b.id === selectedBatchId) ?? null,
    [batches, selectedBatchId],
  );

  const availableYears = useMemo(() => {
    const years = new Set<number>([currentYear]);
    batches.forEach((batch) => years.add(batchPeriod(batch).year));
    return Array.from(years).sort((a, b) => b - a);
  }, [batches, currentYear]);

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0] ?? currentYear);
    }
  }, [availableYears, currentYear, selectedYear]);

  const batchesByMonth = useMemo(() => {
    const map = new Map<number, EmailVerificationBatch[]>();
    for (let month = 1; month <= 12; month += 1) {
      map.set(month, []);
    }
    batches.forEach((batch) => {
      const period = batchPeriod(batch);
      if (period.year !== selectedYear) return;
      map.get(period.month)?.push(batch);
    });
    map.forEach((list) => {
      list.sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return tb - ta;
      });
    });
    return map;
  }, [batches, selectedYear]);

  const totalInYear = useMemo(
    () => Array.from(batchesByMonth.values()).reduce((sum, list) => sum + list.length, 0),
    [batchesByMonth],
  );

  const selectedMonthLabel = MONTHS[selectedMonth - 1] ?? 'Month';
  const selectedMonthBatches = useMemo(
    () => batchesByMonth.get(selectedMonth) ?? [],
    [batchesByMonth, selectedMonth],
  );

  useEffect(() => {
    if ((batchesByMonth.get(selectedMonth)?.length ?? 0) > 0) return;
    for (let month = 12; month >= 1; month -= 1) {
      if ((batchesByMonth.get(month)?.length ?? 0) > 0) {
        setSelectedMonth(month);
        return;
      }
    }
    setSelectedMonth(currentMonth);
  }, [batchesByMonth, currentMonth, selectedMonth]);

  useEffect(() => {
    if (!selectedMonthBatches.length) {
      setSelectedBatchId(null);
      return;
    }
    if (!selectedMonthBatches.some((b) => b.id === selectedBatchId)) {
      setSelectedBatchId(selectedMonthBatches[0].id);
      setRecordPage(1);
    }
  }, [selectedMonthBatches, selectedBatchId]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent || !hasLoadedRef.current) setLoading(true);
    setLoadError('');
    try {
      const list = await bulkEmailVerificationService.listBatches();
      setBatches(list);
      hasLoadedRef.current = true;
    } catch (err) {
      const msg = extractApiError(err, 'Could not load verification data');
      setLoadError(msg);
      if (!opts?.silent) toast.error('Load failed', msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const batchesRef = useRef(batches);
  batchesRef.current = batches;

  const patchBatch = useCallback(
    (id: string, patch: Partial<EmailVerificationBatch>) => {
      setBatches((prev) => prev.map((b) => (b.id === id ? { ...b, ...patch } : b)));
    },
    [],
  );

  const mergeBatch = useCallback((next: EmailVerificationBatch) => {
    setBatches((prev) => prev.map((b) => (b.id === next.id ? next : b)));
  }, []);

  const loadRecords = useCallback(async () => {
    if (!selectedBatchId) {
      setRecords([]);
      setRecordTotal(0);
      setRecordsLoading(false);
      return;
    }
    setRecordsLoading(true);
    try {
      const res = await bulkEmailVerificationService.listRecords(selectedBatchId, {
        page: recordPage,
        limit: 50,
        statuses: statusFilters.length ? statusFilters.join(',') : undefined,
        minScore: minScore === '' ? undefined : Number(minScore),
      });
      setRecords(res.items);
      setRecordTotal(res.pagination.total);
    } catch (err) {
      toast.error('Records load failed', extractApiError(err));
    } finally {
      setRecordsLoading(false);
    }
  }, [selectedBatchId, recordPage, statusFilters, minScore]);

  const refreshBatch = useCallback(async (id: string) => {
    try {
      const batch = await bulkEmailVerificationService.getBatch(id);
      mergeBatch(batch);
    } catch {
      /* polling */
    }
  }, [mergeBatch]);

  useEffect(() => {
    load();
  }, [load]);

  useCrmDataCleared(() => {
    setSelectedBatchId(null);
    setRecords([]);
    setRecordTotal(0);
    void load({ silent: true });
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecords();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      const processing = batchesRef.current.filter((b) => b.status === 'processing');
      if (!processing.length) return;
      void Promise.all(processing.map((b) => refreshBatch(b.id)));
    };
    const timer = setInterval(tick, 5000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') tick();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshBatch]);

  const prospectsToPreviewRows = (prospects: ProspectRow[]) =>
    prospects.map((p) => [
      p.firstName,
      p.lastName,
      p.companyName ?? '',
      p.domain,
      p.email ?? '',
    ]);

  const onFileSelected = async (file: File) => {
    try {
      const sheet = await parseSpreadsheetFile(file);
      const prospects = mapRowsToProspects(sheet.headers, sheet.rows);
      if (!prospects.length) {
        throw new Error('No valid contacts found. Check column names and data.');
      }
      setPendingUpload({
        fileName: sheet.fileName,
        prospects,
        headers: [...PROSPECT_HEADERS],
        rows: prospectsToPreviewRows(prospects),
      });
    } catch (err) {
      toast.error('Could not read file', extractApiError(err));
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const confirmUpload = async () => {
    if (!pendingUpload) return;
    setUploading(true);
    try {
      const batch = await bulkEmailVerificationService.createBatch(
        pendingUpload.fileName,
        pendingUpload.prospects,
      );
      const now = new Date();
      setSelectedYear(now.getFullYear());
      setSelectedMonth(now.getMonth() + 1);
      setSelectedBatchId(batch.id);
      setRecordPage(1);
      setPendingUpload(null);
      await load();
    } catch (err) {
      toast.error('Upload failed', extractApiError(err));
    } finally {
      setUploading(false);
    }
  };

  const viewBatchSourceFile = async (batch: EmailVerificationBatch) => {
    setPreviewLoadingId(batch.id);
    try {
      const source = await bulkEmailVerificationService.listAllProspects(batch.id);
      setFilePreview({
        title: `${source.fileName} — uploaded file`,
        headers: source.headers,
        rows: source.rows,
        totalRows: source.rows.length,
      });
    } catch (err) {
      toast.error('Could not load file', extractApiError(err));
    } finally {
      setPreviewLoadingId(null);
    }
  };

  const resumeVerification = async (batchId: string) => {
    setVerifyingId(batchId);
    setSelectedBatchId(batchId);
    patchBatch(batchId, { status: 'processing' });
    try {
      const result = await bulkEmailVerificationService.startVerification(batchId);
      mergeBatch(result);
      void refreshBatch(batchId);
      if (result.message?.toLowerCase().includes('resuming')) {
        toast.success('Resumed', result.message);
      } else if (result.message) {
        toast.success('Started', result.message);
      }
    } catch (err) {
      patchBatch(batchId, { status: 'failed' });
      toast.error('Could not resume', extractApiError(err));
    } finally {
      setVerifyingId(null);
    }
  };

  const startVerification = async (batchId: string) => {
    setVerifyingId(batchId);
    setSelectedBatchId(batchId);
    patchBatch(batchId, { status: 'processing', progress: 0, processedProspects: 0 });
    try {
      const result = await bulkEmailVerificationService.startVerification(batchId);
      mergeBatch(result);
      void refreshBatch(batchId);
      toast.success('Verification started', result.message ?? 'Running in background.');
    } catch (err) {
      patchBatch(batchId, { status: 'uploaded' });
      toast.error('Could not start', extractApiError(err));
    } finally {
      setVerifyingId(null);
    }
  };

  const deleteBatch = async (batch: EmailVerificationBatch) => {
    if (!window.confirm(`Remove "${batch.sourceFileName}"?`)) return;
    const deletedId = batch.id;
    try {
      await bulkEmailVerificationService.deleteBatch(deletedId);
      setBatches((prev) => prev.filter((b) => b.id !== deletedId));
      if (selectedBatchId === deletedId) {
        setSelectedBatchId(null);
        setRecords([]);
        setRecordTotal(0);
      }
      toast.success('Removed', 'Job deleted.');
      void load({ silent: true });
    } catch (err) {
      toast.error('Delete failed', extractApiError(err));
      void load({ silent: true });
    }
  };

  const resetBatch = async (batchId: string) => {
    try {
      await bulkEmailVerificationService.resetBatch(batchId);
      setRecords([]);
      setRecordTotal(0);
      void load({ silent: true });
    } catch (err) {
      toast.error('Reset failed', extractApiError(err));
    }
  };

  const rerunBatch = async (batchId: string) => {
    setVerifyingId(batchId);
    setSelectedBatchId(batchId);
    patchBatch(batchId, { status: 'processing', progress: 0, processedProspects: 0 });
    try {
      await bulkEmailVerificationService.resetBatch(batchId);
      const result = await bulkEmailVerificationService.startVerification(batchId);
      mergeBatch(result);
      void refreshBatch(batchId);
      toast.success('Re-run started', result.message ?? 'Verification running.');
    } catch (err) {
      patchBatch(batchId, { status: 'uploaded' });
      toast.error('Re-run failed', extractApiError(err));
    } finally {
      setVerifyingId(null);
    }
  };

  type ExportKind = 'status' | 'corrected' | 'best';

  const exportHeadersByKind: Record<ExportKind, string[]> = {
    status: [
      'First Name',
      'Last Name',
      'Company Name',
      'Company Domain',
      'Best Email (use this)',
      'Generated Email',
      'Corrected Email',
      'Pattern',
      'Verification Status',
      'Check Details',
      'Confidence Score',
      'Confidence Label',
      'MX Valid',
      'Provider',
    ],
    corrected: ['Email'],
    best: ['Email'],
  };

  const recordToExportRow = (r: EmailVerificationRecord, kind: ExportKind) => {
    if (kind === 'corrected') {
      return [r.correctedEmail ?? ''];
    }
    if (kind === 'best') {
      return [r.recommendedEmail || r.generatedEmail];
    }
    return [
      r.firstName,
      r.lastName,
      r.companyName ?? '',
      r.domain,
      r.recommendedEmail || r.correctedEmail || r.generatedEmail,
      r.generatedEmail,
      r.correctedEmail ?? '',
      r.patternType ?? '',
      r.verificationStatus,
      r.zerobounceStatus ?? '',
      String(r.confidenceScore),
      r.confidenceLabel,
      r.mxValid ? 'yes' : 'no',
      r.verificationProvider ?? '',
    ];
  };

  const hasCorrectedEmail = (r: EmailVerificationRecord) =>
    Boolean(
      r.correctedEmail &&
        r.correctedEmail.toLowerCase() !== r.generatedEmail.toLowerCase(),
    );

  const handleExportXlsx = async (
    kind: ExportKind,
    statusesOverride?: EmailVerificationStatus[],
  ) => {
    if (!selectedBatchId) return;
    const activeStatuses = statusesOverride?.length ? statusesOverride : statusFilters;
    if (!activeStatuses.length) {
      toast.error('Select statuses', 'Choose at least one status in the filter before download.');
      return;
    }
    setExporting(true);
    try {
      const statusesParam = activeStatuses.join(',');
      const exportFilters = {
        statuses: statusesParam,
        minScore: minScore === '' ? undefined : Number(minScore),
        emailKind:
          kind === 'corrected'
            ? ('corrected' as const)
            : kind === 'best'
              ? ('best' as const)
              : undefined,
      };
      const allowed = new Set(activeStatuses);
      const fetched = await bulkEmailVerificationService.listAllRecords(
        selectedBatchId,
        exportFilters,
      );
      let items = fetched.filter((r) => allowed.has(r.verificationStatus));
      if (kind === 'corrected') {
        items = items.filter(hasCorrectedEmail);
      }
      if (!items.length) {
        const statusLabel = activeStatuses.map((s) => formatStatus(s)).join(', ');
        if (kind === 'corrected') {
          throw new Error(
            `No corrected-email contacts for status: ${statusLabel}. Try other statuses or Re-run verify.`,
          );
        }
        throw new Error(
          `No contacts with status: ${statusLabel}. Change filter or run Verify again.`,
        );
      }
      const statusSlug = activeStatuses.map((s) => s.replace(/_/g, '-')).join('-');
      const statusLabel = activeStatuses.map((s) => formatStatus(s)).join(', ');
      const kindSlug =
        kind === 'corrected' ? 'corrected-email' : kind === 'best' ? 'best-email' : statusSlug;
      const sheetName =
        kind === 'status'
          ? statusLabel
          : kind === 'corrected'
            ? `Corrected — ${statusLabel}`
            : `Best email — ${statusLabel}`;
      const baseName = selectedBatch?.sourceFileName?.replace(/\.[^.]+$/, '') ?? 'emails';
      await downloadSpreadsheetXlsx(
        {
          fileName: `${baseName}-${kindSlug}.xlsx`,
          sheetName: sheetName.slice(0, 31),
          headers: exportHeadersByKind[kind],
          rows: items.map((r) => recordToExportRow(r, kind)),
        },
        `email-verification-${baseName}-${kindSlug}.xlsx`,
      );
      const kindNote =
        kind === 'corrected'
          ? 'corrected email only'
          : kind === 'best'
            ? 'best email only'
            : statusLabel;
      toast.success('Export ready', `${items.length} contact(s) — ${kindNote}.`);
    } catch (err) {
      toast.error('Export failed', extractApiError(err));
    } finally {
      setExporting(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      await downloadSpreadsheetXlsx(
        {
          fileName: 'email-verification-template.xlsx',
          sheetName: 'Prospects',
          headers: [
            'First Name',
            'Last Name',
            'Company Name',
            'Company Domain',
            'Email',
          ],
          rows: [
            ['Jane', 'Doe', 'Acme Corp', 'acme.com', ''],
            ['John', 'Smith', 'Globex', '', 'john.smith@globex.io'],
          ],
        },
        'email-verification-template.xlsx',
      );
    } catch {
      toast.error('Download failed', 'Could not create template.');
    }
  };

  const applyStatusFilter = (status: EmailVerificationStatus) => {
    setStatusFilters([status]);
    setRecordPage(1);
  };

  const metrics = useMemo(() => {
    if (!selectedBatch) {
      return STATUS_METRIC_OPTIONS.map((opt) => ({
        ...opt,
        value: '—' as const,
      }));
    }
    return STATUS_METRIC_OPTIONS.map((opt) => ({
      ...opt,
      value: opt.getCount(selectedBatch),
    }));
  }, [selectedBatch]);

  return (
    <AttendanceFullBleed className="gap-3 py-3">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFileSelected(f);
          e.target.value = '';
        }}
      />

      <ExcelSheetShell
        title="Email Finder & Verification"
        loading={loading}
        hint="Domain only → generate & verify patterns · Email column → verify your address & suggest fix if wrong"
        toolbar={
          <div className="flex w-full flex-col gap-3">
            <div className="rounded-xl border border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3 text-xs leading-relaxed text-slate-600 shadow-sm">
              <p className="font-semibold text-slate-800">How verification works</p>
              <p className="mt-1">
                Domain only → generate & verify patterns from name + company. Email column → verify
                your uploaded address and suggest a corrected pattern when needed.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void load({ silent: true })}
                disabled={loading}
                className={shellBtn()}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
                Refresh
              </button>
              <button type="button" onClick={downloadTemplate} className={shellBtn()}>
                <Download className="h-3.5 w-3.5" />
                Template
              </button>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={uploading}
                className={shellBtn(
                  'border-violet-600 bg-violet-600 text-white shadow-md hover:border-violet-700 hover:bg-violet-700',
                )}
              >
                {uploading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Upload file
              </button>
            </div>
          </div>
        }
      >
        {loadError ? (
          <div className="border-b border-amber-200 bg-gradient-to-r from-amber-50 to-white px-4 py-3 text-sm text-amber-900">
            {loadError}
          </div>
        ) : null}

        <div className="bg-white">
          {selectedBatch ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Verification summary
                </p>
                <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">
                  {selectedBatch.sourceFileName}
                </p>
              </div>
              {selectedBatch.status === 'processing' ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100 px-2.5 py-1 text-xs font-semibold text-sky-800">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Updating…
                </span>
              ) : null}
            </div>
          ) : (
            <p className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              Select a file in the month folder below to see verification stats.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6">
            {metrics.map((m) => {
              const active =
                statusFilters.length === 1 && statusFilters[0] === m.status;
              const accent = METRIC_ACCENT[m.status];
              const Icon = accent.icon;
              return (
                <div
                  key={m.status}
                  className={cn(
                    'group relative overflow-hidden rounded-xl border bg-white p-3 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md',
                    accent.border,
                    active && 'ring-2 ring-emerald-500/30',
                    accent.card,
                  )}
                >
                  <button
                    type="button"
                    disabled={!selectedBatch}
                    onClick={() => applyStatusFilter(m.status)}
                    className="w-full text-left disabled:cursor-default"
                    title={`Show only ${m.label}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-wider',
                            accent.label,
                          )}
                        >
                          {m.label}
                        </p>
                        <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">
                          {m.value}
                        </p>
                      </div>
                      <div
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 shadow-sm',
                          accent.label,
                        )}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                    </div>
                  </button>
                  {canDownload && selectedBatch?.status === 'completed' ? (
                    <button
                      type="button"
                      disabled={exporting || m.value === 0 || m.value === '—'}
                      onClick={() => void handleExportXlsx('status', [m.status])}
                      className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-white/80 bg-white/90 px-2 py-1.5 text-[10px] font-semibold text-emerald-700 shadow-sm transition-colors hover:bg-white disabled:opacity-40"
                      title={`Download ${m.label} only`}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </ExcelSheetShell>

      <ExcelSheetShell
        title="Verification folders by month"
        rowCount={totalInYear}
        loading={loading}
        hint="Month-wise verification history"
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">Year</span>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 shadow-sm">
              12 folders · Jan–Dec
            </span>
            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-700 shadow-sm">
              {totalInYear} job{totalInYear === 1 ? '' : 's'} in {selectedYear}
            </span>
          </div>
        }
      >
        <div className="grid min-h-[320px] grid-cols-1 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[minmax(200px,260px)_1fr]">
          <aside className="border-b border-slate-200 bg-slate-50/40 lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-200 bg-slate-100/70 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {selectedYear} folders
            </div>
            <table className="w-full border-collapse text-xs">
              <thead className="bg-white/70">
                <tr>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-left text-[10px] uppercase text-slate-500" />
                  <th className="border-b border-slate-200 px-2 py-1.5 text-left text-[10px] uppercase text-slate-500">
                    Month
                  </th>
                  <th className="border-b border-slate-200 px-2 py-1.5 text-right text-[10px] uppercase text-slate-500">
                    #
                  </th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((monthLabel, index) => {
                  const month = index + 1;
                  const count = batchesByMonth.get(month)?.length ?? 0;
                  const active = selectedMonth === month;
                  return (
                    <tr
                      key={monthLabel}
                      onClick={() => {
                        setSelectedMonth(month);
                        setRecordPage(1);
                      }}
                      className={cn(
                        'cursor-pointer transition-colors',
                        active ? 'bg-emerald-50' : 'hover:bg-slate-50',
                      )}
                    >
                      <td className="border-b border-slate-200 px-2 py-1.5 text-center">
                        <Folder
                          className={cn(
                            'mx-auto h-3.5 w-3.5',
                            active ? 'text-[#217346]' : 'text-slate-400',
                          )}
                        />
                      </td>
                      <td className="border-b border-slate-200 px-2 py-1.5 font-medium text-slate-700">
                        {monthLabel}
                      </td>
                      <td className="border-b border-slate-200 px-2 py-1.5 text-right font-mono text-slate-800">
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </aside>

          <section className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200 bg-gradient-to-r from-emerald-50 to-white px-4 py-2.5">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
                <ChevronRight className="h-4 w-4" />
                <span>{selectedMonthLabel} folder</span>
              </div>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-xs font-medium text-slate-600 shadow-sm">
                {selectedMonthBatches.length} job
                {selectedMonthBatches.length === 1 ? '' : 's'} · {selectedYear}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    {[
                      'File',
                      'Uploaded on',
                      'Prospects',
                      'Best emails',
                      'Status',
                      'Progress',
                      'Actions',
                    ].map((label) => (
                      <th
                        key={label}
                        className="border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selectedMonthBatches.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-4 py-12 text-center text-slate-500"
                      >
                        No verification jobs in {selectedMonthLabel} {selectedYear} yet. Upload a
                        file to add one to this folder.
                      </td>
                    </tr>
                  ) : (
                    selectedMonthBatches.map((batch) => {
                      const selected = selectedBatchId === batch.id;
                      const hasPartialProgress =
                        batch.processedProspects > 0 &&
                        batch.processedProspects < batch.totalProspects;
                      const staleMs = batch.updatedAt
                        ? Date.now() - new Date(batch.updatedAt).getTime()
                        : Number.POSITIVE_INFINITY;
                      const processingPaused =
                        batch.status === 'processing' && staleMs > 120_000;
                      const canResume =
                        hasPartialProgress &&
                        (batch.status === 'failed' || processingPaused);
                      const isStuck =
                        batch.status === 'processing' &&
                        batch.processedProspects === 0 &&
                        batch.emailsGenerated === 0;

                      return (
                        <tr
                          key={batch.id}
                          onClick={() => {
                            setSelectedBatchId(batch.id);
                            setRecordPage(1);
                            void refreshBatch(batch.id);
                          }}
                          className={cn(
                            'cursor-pointer transition-colors even:bg-slate-50/50 hover:bg-emerald-50/40',
                            selected && 'bg-emerald-50/70',
                          )}
                        >
                          <td className="border-b border-slate-200 px-3 py-2.5">
                            <div className="font-medium text-slate-900">{batch.sourceFileName}</div>
                          </td>
                          <td className="border-b border-slate-200 px-3 py-2.5 text-slate-700">
                            {formatBatchDate(batch.createdAt)}
                          </td>
                          <td className="border-b border-slate-200 px-3 py-2.5 text-slate-700">
                            {batch.processedProspects}/{batch.totalProspects}
                          </td>
                          <td className="border-b border-slate-200 px-3 py-2.5 text-slate-700">
                            {batch.emailsGenerated}
                          </td>
                          <td className="border-b border-slate-200 px-3 py-2.5">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                STATUS_BADGE[batch.status],
                              )}
                            >
                              {STATUS_LABEL[batch.status]}
                            </span>
                          </td>
                          <td className="border-b border-slate-200 px-3 py-2.5 text-slate-700">
                            {batch.status === 'processing' ? (
                              <div className="flex items-center gap-2">
                                <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all"
                                    style={{ width: `${batch.progress}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-emerald-700">
                                  {batch.progress}%
                                </span>
                              </div>
                            ) : batch.status === 'completed' ? (
                              batch.emailsGenerated > 0
                                ? `${batch.emailsGenerated} contacts · ${(batch.verifiedCount ?? 0) + (batch.likelyValidCount ?? 0)} verified`
                                : '0 contacts — Re-run after reset'
                            ) : (
                              '—'
                            )}
                          </td>
                          <td
                            className="border-b border-slate-200 px-3 py-2.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex flex-wrap gap-1">
                              <button
                                type="button"
                                title="View uploaded file"
                                disabled={previewLoadingId === batch.id}
                                onClick={() => void viewBatchSourceFile(batch)}
                                className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                              >
                                {previewLoadingId === batch.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                                File
                              </button>
                              {batch.status === 'uploaded' && (
                                <button
                                  type="button"
                                  disabled={verifyingId === batch.id}
                                  onClick={() => startVerification(batch.id)}
                                  className="inline-flex items-center gap-1 rounded border border-[#217346] bg-[#217346] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#1a5c38] disabled:opacity-60"
                                >
                                  {verifyingId === batch.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                  Verify
                                </button>
                              )}
                              {batch.status === 'failed' && (
                                <button
                                  type="button"
                                  disabled={verifyingId === batch.id}
                                  onClick={() => resumeVerification(batch.id)}
                                  className="inline-flex items-center gap-1 rounded border border-[#217346] bg-[#217346] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#1a5c38] disabled:opacity-60"
                                >
                                  {verifyingId === batch.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                  {hasPartialProgress ? 'Resume' : 'Retry'}
                                </button>
                              )}
                              {canResume && (
                                <button
                                  type="button"
                                  disabled={verifyingId === batch.id}
                                  onClick={() => resumeVerification(batch.id)}
                                  className="inline-flex items-center gap-1 rounded border border-[#217346] bg-[#217346] px-2 py-1 text-[11px] font-semibold text-white hover:bg-[#1a5c38] disabled:opacity-60"
                                >
                                  {verifyingId === batch.id ? (
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                  ) : (
                                    <Play className="h-3 w-3" />
                                  )}
                                  Resume
                                </button>
                              )}
                              {isStuck && (
                                <button
                                  type="button"
                                  disabled={verifyingId === batch.id}
                                  onClick={() => resumeVerification(batch.id)}
                                  className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-900 disabled:opacity-60"
                                >
                                  Resume
                                </button>
                              )}
                              {(batch.status === 'completed' || batch.status === 'failed') && (
                                <button
                                  type="button"
                                  disabled={verifyingId === batch.id}
                                  onClick={() => rerunBatch(batch.id)}
                                  className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50"
                                >
                                  Re-run
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => deleteBatch(batch)}
                                className="inline-flex items-center justify-center rounded border border-slate-300 bg-white p-1 text-slate-500 hover:text-red-600"
                                title="Delete"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </ExcelSheetShell>

      <ExcelSheetShell
        title={
          selectedBatch
            ? `${selectedMonthLabel} ${selectedYear} — ${selectedBatch.sourceFileName}`
            : `${selectedMonthLabel} ${selectedYear} — Email results`
        }
        rowCount={
          recordTotal > 0
            ? recordTotal
            : selectedBatch?.emailsGenerated ?? 0
        }
        countUnit="contact"
        loading={loading}
        hint="Excel-style results grid"
        toolbar={
          <div className="flex w-full flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                {selectedMonthLabel} {selectedYear}
              </span>
              {selectedBatch && (
                <>
                  <span className="max-w-[220px] truncate rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-800 shadow-sm">
                    {selectedBatch.sourceFileName}
                  </span>
                  <button
                    type="button"
                    disabled={previewLoadingId === selectedBatch.id}
                    onClick={() => void viewBatchSourceFile(selectedBatch)}
                    className={shellBtn()}
                  >
                    {previewLoadingId === selectedBatch.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    View file
                  </button>
                </>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-2.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Filters
              </span>
              <VerificationStatusFilter
                value={statusFilters}
                disabled={!selectedBatchId}
                onChange={(next) => {
                  setStatusFilters(next);
                  setRecordPage(1);
                }}
              />
              <select
                value={minScore === '' ? '' : String(minScore)}
                onChange={(e) => {
                  setMinScore(e.target.value === '' ? '' : Number(e.target.value));
                  setRecordPage(1);
                }}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                title="Minimum confidence score"
              >
                <option value="">All scores</option>
                <option value="80">Score 80+</option>
                <option value="95">Score 95+</option>
              </select>
              {canDownload && selectedBatch?.status === 'completed' ? (
                <>
                  <span className="hidden h-5 w-px bg-slate-300 sm:block" />
                  <button
                    type="button"
                    disabled={!selectedBatchId || exporting || statusFilters.length === 0}
                    onClick={() => void handleExportXlsx('status')}
                    className={shellBtn(
                      'border-emerald-600 bg-emerald-600 text-white shadow-md hover:border-emerald-700 hover:bg-emerald-700',
                    )}
                    title={
                      statusFilters.length
                        ? `Full export — statuses: ${statusFilters.map((s) => formatStatus(s)).join(', ')}`
                        : 'Select at least one status to download'
                    }
                  >
                    {exporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    Download
                    {statusFilters.length > 0 ? (
                      <span className="font-normal opacity-90">
                        ({statusFilterLabel(statusFilters)})
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    disabled={!selectedBatchId || exporting || statusFilters.length === 0}
                    onClick={() => void handleExportXlsx('corrected')}
                    className={shellBtn()}
                    title="Only corrected emails — one Email column per contact"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Corrected
                  </button>
                  <button
                    type="button"
                    disabled={!selectedBatchId || exporting || statusFilters.length === 0}
                    onClick={() => void handleExportXlsx('best')}
                    className={shellBtn()}
                    title="Same status filter — one Email column (best/recommended) per contact"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Best email
                  </button>
                </>
              ) : null}
            </div>
          </div>
        }
      >
        {selectedBatch?.status === 'completed' &&
        (selectedBatch.verifiedCount ?? 0) +
          (selectedBatch.likelyValidCount ?? 0) ===
          0 &&
        (selectedBatch.emailsGenerated ?? 0) > 0 ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
            Verification finished but no deliverable emails were found. Check that prospects have
            valid company domains or email addresses.
          </div>
        ) : null}

        <div className="overflow-x-auto bg-white p-3">
          <table className="w-full min-w-[900px] overflow-hidden rounded-xl border border-slate-200 text-sm shadow-sm">
            <thead className="bg-slate-50/90">
              <tr>
                {[
                  'Name',
                  'Company',
                  'Domain',
                  'Best email',
                  'Corrected',
                  'Status',
                  'Result',
                  'Score',
                ].map(
                  (label) => (
                    <th
                      key={label}
                      className="border-b border-slate-200 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide text-slate-500"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {!selectedBatchId ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    <Mail className="mx-auto mb-3 h-8 w-8 text-slate-300" />
                    Select a job from the {selectedMonthLabel} folder to view email results.
                  </td>
                </tr>
              ) : recordsLoading && records.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-emerald-600" />
                    Loading results…
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-4 py-12 text-center text-slate-500"
                  >
                    {selectedBatch?.status === 'uploaded' ? (
                          'Click Verify on this job to generate and check emails.'
                        ) : selectedBatch?.status === 'processing' ? (
                          'Verification in progress…'
                        ) : statusFilters.length > 0 || minScore !== '' ? (
                          <span>
                            No contacts match the current filters.{' '}
                            <button
                              type="button"
                              className="font-semibold text-emerald-700 underline"
                              onClick={() => {
                                setStatusFilters([]);
                                setMinScore('');
                                setRecordPage(1);
                              }}
                            >
                              Clear filters
                            </button>
                            {canDownload ? ' or adjust statuses before download.' : '.'}
                          </span>
                        ) : (selectedBatch?.emailsGenerated ?? 0) > 0 ? (
                          'Contacts are syncing — click Refresh or Re-run verification.'
                        ) : (
                          'No email contacts yet. Click Verify on this job.'
                        )}
                  </td>
                </tr>
              ) : (
                records.map((r) => (
                  <tr
                    key={r.id}
                    className="transition-colors hover:bg-emerald-50/30 even:bg-slate-50/40"
                  >
                    <td className="px-3 py-2.5 whitespace-nowrap font-medium text-slate-900">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{r.companyName || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.domain}</td>
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-emerald-700">
                      {r.recommendedEmail || r.generatedEmail}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">
                      {r.correctedEmail && r.correctedEmail !== r.generatedEmail
                        ? r.correctedEmail
                        : '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize',
                          RECORD_STATUS[r.verificationStatus],
                        )}
                      >
                        {formatStatus(r.verificationStatus)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600">
                      {friendlyCheckLabel(r.smtpResponse, r.verificationStatus)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span
                        className={cn(
                          'inline-flex min-w-[2.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ring-1 ring-inset',
                          scoreTone(r.confidenceScore),
                        )}
                      >
                        {r.confidenceScore}
                      </span>
                    </td>
                  </tr>
                ))
                  )}
            </tbody>
          </table>
        </div>

        {recordTotal > 50 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
            <span className="font-medium">
              Page {recordPage} of {Math.ceil(recordTotal / 50)} · {recordTotal} contacts
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={recordPage <= 1}
                onClick={() => setRecordPage((p) => p - 1)}
                className={shellBtn('disabled:opacity-40')}
              >
                Previous
              </button>
              <button
                type="button"
                disabled={recordPage * 50 >= recordTotal}
                onClick={() => setRecordPage((p) => p + 1)}
                className={shellBtn('disabled:opacity-40')}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </ExcelSheetShell>

      <SpreadsheetPreviewModal
        isOpen={Boolean(pendingUpload)}
        onClose={() => !uploading && setPendingUpload(null)}
        alignTop
        title={pendingUpload ? `${pendingUpload.fileName} — review before upload` : 'Preview'}
        headers={pendingUpload?.headers ?? [...PROSPECT_HEADERS]}
        rows={pendingUpload?.rows ?? []}
        totalRows={pendingUpload?.rows.length}
        note="First Name, Last Name, Company Name, Company Domain, and Email can all be present — domain is used for patterns; Email is fully verified."
        actions={
          pendingUpload
            ? [
                {
                  label: 'Cancel',
                  onClick: () => setPendingUpload(null),
                  disabled: uploading,
                  variant: 'secondary',
                },
                {
                  label: `Upload ${pendingUpload.prospects.length} prospect(s)`,
                  onClick: confirmUpload,
                  loading: uploading,
                  disabled: uploading,
                  variant: 'primary',
                },
              ]
            : undefined
        }
      />

      <SpreadsheetPreviewModal
        isOpen={Boolean(filePreview)}
        onClose={() => setFilePreview(null)}
        title={filePreview?.title ?? 'Uploaded file'}
        headers={filePreview?.headers ?? [...PROSPECT_HEADERS]}
        rows={filePreview?.rows ?? []}
        totalRows={filePreview?.totalRows}
        note="Original prospects from this upload (before email verification)."
        actions={[{ label: 'Close', onClick: () => setFilePreview(null), variant: 'secondary' }]}
      />
    </AttendanceFullBleed>
  );
}
