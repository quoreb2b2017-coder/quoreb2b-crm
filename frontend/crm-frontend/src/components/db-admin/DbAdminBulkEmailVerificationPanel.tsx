'use client';

import { WORKSPACE_TIMEZONE, todayDateKey } from '@/lib/constants/workspace-timezone';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Download,
  Folder,
  Loader2,
  Mail,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  Eye,
} from 'lucide-react';
import { SpreadsheetPreviewModal } from '@/components/spreadsheet/SpreadsheetPreviewModal';
import { parseSpreadsheetFile } from '@/lib/spreadsheet/parse-spreadsheet';
import { downloadSpreadsheetXlsx } from '@/lib/spreadsheet/export-spreadsheet';
import {
  bulkEmailVerificationService,
  type BatchDiagnostics,
  type EmailVerificationBatch,
  type BatchStatus,
  type EmailVerificationRecord,
  type EmailVerificationStatus,
  type ProspectRow,
  type VerificationAnalytics,
} from '@/lib/api/bulk-email-verification.service';
import { extractApiError } from '@/lib/api/errors';
import { useCrmDataCleared } from '@/hooks/useCrmDataCleared';
import { toast } from '@/stores/toast.store';
import { AttendanceFullBleed } from '@/components/attendance/AttendanceFullBleed';
import { ExcelSheetShell } from '@/components/attendance/ExcelSheetShell';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/store/auth.store';

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
  valid: 'bg-emerald-50 text-emerald-800',
  likely_valid: 'bg-green-50 text-green-800',
  catch_all: 'bg-amber-50 text-amber-800',
  risky: 'bg-orange-50 text-orange-800',
  invalid: 'bg-red-50 text-red-800',
  unknown: 'bg-slate-100 text-slate-600',
};

const STATUS_FILTER_OPTIONS: { value: EmailVerificationStatus; label: string }[] = [
  { value: 'valid', label: 'Valid' },
  { value: 'likely_valid', label: 'Likely valid' },
  { value: 'catch_all', label: 'Catch-all' },
  { value: 'risky', label: 'Risky' },
  { value: 'invalid', label: 'Invalid' },
  { value: 'unknown', label: 'Unknown' },
];

const DEFAULT_STATUS_FILTERS: EmailVerificationStatus[] = [
  'valid',
  'likely_valid',
  'catch_all',
];

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function domainFromEmailAddress(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1 || at >= email.length - 1) return '';
  return email.slice(at + 1).trim().toLowerCase();
}

function mapRowsToProspects(headers: string[], rows: string[][]): ProspectRow[] {
  const idx = {
    firstName: headers.findIndex((h) =>
      ['firstname', 'first', 'fname'].includes(normalizeHeader(h)),
    ),
    lastName: headers.findIndex((h) =>
      ['lastname', 'last', 'lname', 'surname'].includes(normalizeHeader(h)),
    ),
    companyName: headers.findIndex((h) =>
      ['companyname', 'company', 'organization', 'org'].includes(normalizeHeader(h)),
    ),
    domain: headers.findIndex((h) =>
      ['companydomain', 'domain', 'website', 'companywebsite', 'emaildomain'].includes(
        normalizeHeader(h),
      ),
    ),
    email: headers.findIndex((h) =>
      ['email', 'emailaddress', 'emailid', 'workemail', 'businessemail', 'e-mail'].includes(
        normalizeHeader(h),
      ),
    ),
  };

  if (idx.firstName < 0 || idx.lastName < 0) {
    throw new Error('Required columns: First Name and Last Name');
  }
  if (idx.domain < 0 && idx.email < 0) {
    throw new Error(
      'Add Company Domain or Email — need First Name, Last Name, and one of those (Company Name optional)',
    );
  }

  return rows
    .map((row) => {
      const firstName = (row[idx.firstName] ?? '').trim();
      const lastName = (row[idx.lastName] ?? '').trim();
      const companyName = idx.companyName >= 0 ? (row[idx.companyName] ?? '').trim() : '';
      const emailRaw = idx.email >= 0 ? (row[idx.email] ?? '').trim().toLowerCase() : '';
      let domain = idx.domain >= 0 ? (row[idx.domain] ?? '').trim() : '';
      if (emailRaw) {
        const fromEmail = domainFromEmailAddress(emailRaw);
        if (!domain) domain = fromEmail;
      }
      const prospect: ProspectRow = {
        firstName,
        lastName,
        companyName,
        domain,
      };
      if (emailRaw) prospect.email = emailRaw;
      return prospect;
    })
    .filter((r) => {
      if (!r.firstName || !r.lastName) return false;
      if (r.email && !r.domain) {
        r.domain = domainFromEmailAddress(r.email);
      }
      return Boolean(r.domain);
    });
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

function shellBtn(className?: string) {
  return cn(
    'inline-flex items-center gap-1.5 border border-[#c6c6c6] bg-white px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-[#fafafa] disabled:opacity-50',
    className,
  );
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
          'inline-flex min-w-[9.5rem] items-center justify-between gap-2 border border-[#c6c6c6] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:bg-[#fafafa] disabled:opacity-50',
          open && 'border-[#217346] ring-1 ring-[#217346]/30',
        )}
      >
        <span className="truncate">{statusFilterLabel(value)}</span>
        <ChevronDown
          className={cn('h-3.5 w-3.5 shrink-0 text-slate-400', open && 'rotate-180')}
        />
      </button>
      <div
        className={cn(
          'absolute left-0 z-50 mt-1 min-w-[11rem] border border-[#c6c6c6] bg-white shadow-lg',
          open ? 'block' : 'hidden',
        )}
      >
        <div className="flex items-center justify-between border-b border-[#e8e8e8] px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Status
          </span>
          <button
            type="button"
            className="text-[10px] font-semibold text-[#217346] hover:underline"
            onClick={() => onChange([...DEFAULT_STATUS_FILTERS])}
          >
            Reset
          </button>
        </div>
        <ul className="max-h-52 overflow-y-auto py-1">
          {STATUS_FILTER_OPTIONS.map((opt) => {
            const active = value.includes(opt.value);
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className={cn(
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] hover:bg-[#e8f5ee]',
                    active ? 'font-semibold text-[#1a5c38]' : 'text-slate-700',
                  )}
                >
                  <span
                    className={cn(
                      'flex h-3.5 w-3.5 shrink-0 items-center justify-center border',
                      active
                        ? 'border-[#217346] bg-[#217346] text-white'
                        : 'border-slate-300 bg-white',
                    )}
                  >
                    {active ? <Check className="h-2.5 w-2.5" /> : null}
                  </span>
                  {opt.label}
                </button>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-[#e8e8e8] px-2 py-1.5 text-[10px] text-slate-500">
          Download includes only checked statuses.
        </div>
      </div>
    </div>
  );
}

export function DbAdminBulkEmailVerificationPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const canDownload = useAuthStore((s) => s.hasRole('super_admin'));
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [analytics, setAnalytics] = useState<VerificationAnalytics | null>(null);
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
  const [diagnostics, setDiagnostics] = useState<BatchDiagnostics | null>(null);
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
      const [stats, list] = await Promise.all([
        bulkEmailVerificationService.getAnalytics(),
        bulkEmailVerificationService.listBatches(),
      ]);
      setAnalytics(stats);
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
    setDiagnostics(null);
    void load({ silent: true });
  });

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadRecords();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [loadRecords]);

  const selectedBatchStatus = useMemo(
    () => batches.find((b) => b.id === selectedBatchId)?.status,
    [batches, selectedBatchId],
  );

  useEffect(() => {
    if (!selectedBatchId) {
      setDiagnostics(null);
      return;
    }
    if (selectedBatchStatus !== 'completed' && selectedBatchStatus !== 'failed') {
      setDiagnostics(null);
      return;
    }
    let cancelled = false;
    bulkEmailVerificationService
      .getBatchDiagnostics(selectedBatchId)
      .then((data) => {
        if (!cancelled) setDiagnostics(data);
      })
      .catch((err) => {
        if (!cancelled) setDiagnostics(null);
        console.warn('Diagnostics unavailable:', extractApiError(err));
      });
    return () => {
      cancelled = true;
    };
  }, [selectedBatchId, selectedBatchStatus]);

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
        setDiagnostics(null);
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
      setDiagnostics(null);
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

  const handleExportXlsx = async (kind: ExportKind) => {
    if (!selectedBatchId) return;
    if (!statusFilters.length) {
      toast.error('Select statuses', 'Choose at least one status in the filter before download.');
      return;
    }
    setExporting(true);
    try {
      const statusesParam = statusFilters.join(',');
      const exportFilters = {
        statuses: statusesParam,
        minScore: minScore === '' ? undefined : Number(minScore),
        emailKind: kind === 'corrected' ? ('corrected' as const) : undefined,
      };
      const allowed = new Set(statusFilters);
      const fetched = await bulkEmailVerificationService.listAllRecords(
        selectedBatchId,
        exportFilters,
      );
      let items = fetched.filter((r) => allowed.has(r.verificationStatus));
      if (kind === 'corrected') {
        items = items.filter(hasCorrectedEmail);
      }
      if (!items.length) {
        const statusLabel = statusFilters.map((s) => formatStatus(s)).join(', ');
        if (kind === 'corrected') {
          throw new Error(
            `No corrected-email contacts for status: ${statusLabel}. Try other statuses or Re-run verify.`,
          );
        }
        throw new Error(
          `No contacts with status: ${statusLabel}. Change filter or run Verify again.`,
        );
      }
      const statusSlug = statusFilters.map((s) => s.replace(/_/g, '-')).join('-');
      const statusLabel = statusFilters.map((s) => formatStatus(s)).join(', ');
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

  const metrics = useMemo(() => {
    if (!selectedBatch) {
      return [
        { label: 'Prospects', value: '—' },
        { label: 'SMTP confirmed', value: '—' },
        { label: 'Likely valid', value: '—' },
        { label: 'Match rate', value: '—' },
      ];
    }
    return [
      { label: 'Prospects', value: selectedBatch.totalProspects },
      { label: 'SMTP confirmed', value: selectedBatch.verifiedCount },
      { label: 'Likely valid', value: selectedBatch.likelyValidCount ?? 0 },
      { label: 'Match rate', value: `${selectedBatch.successRate}%` },
    ];
  }, [selectedBatch]);

  return (
    <AttendanceFullBleed className="gap-4 px-4 py-4 sm:px-5">
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
        hint="Domain = verify emails · Email column = format scan only (all Valid)"
        toolbar={
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">
              Upload prospects, then verify from the month folder below.
            </span>
            <span className="text-slate-300">|</span>
            <button type="button" onClick={() => void load({ silent: true })} disabled={loading} className={shellBtn()}>
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
              className={shellBtn('border-[#6d28d9] bg-[#6d28d9] text-white hover:bg-[#5b21b6]')}
            >
              {uploading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              Upload file
            </button>
          </div>
        }
      >
        {loadError ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
            {loadError}
          </div>
        ) : null}
        {analytics ? (
          <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-900">
            <strong>In-house verification engine</strong> — checks multiple patterns per person in the
            backend, saves <strong>one best email</strong> only (valid → likely → catch-all → highest
            score). Disposable list: {analytics.disposableDomainsLoaded ?? 0} domains. Queue:{' '}
            <code>{analytics.queueBackend ?? 'in-process'}</code>.
          </div>
        ) : null}

        <div className="overflow-x-auto bg-white">
          {selectedBatch ? (
            <p className="border-b border-[#e0e0e0] bg-[#fafafa] px-3 py-1.5 text-[11px] text-slate-600">
              Stats for:{' '}
              <span className="font-semibold text-slate-800">{selectedBatch.sourceFileName}</span>
              {selectedBatch.status === 'processing' ? (
                <span className="ml-2 text-sky-700">(updating…)</span>
              ) : null}
            </p>
          ) : (
            <p className="border-b border-[#e0e0e0] bg-[#fafafa] px-3 py-1.5 text-[11px] text-slate-500">
              Select a file in the month folder below to see its stats.
            </p>
          )}
          <table className="w-full min-w-full border-collapse text-[13px]">
            <thead>
              <tr>
                {metrics.map((m) => (
                  <th
                    key={m.label}
                    className="border border-[#c6c6c6] bg-[#f2f2f2] px-3 py-2 text-left text-xs font-semibold text-slate-700"
                  >
                    {m.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {metrics.map((m) => (
                  <td
                    key={m.label}
                    className="border border-[#e0e0e0] px-3 py-2 text-sm font-semibold text-slate-900"
                  >
                    {m.value}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
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
              className="border border-[#c6c6c6] bg-white px-2 py-1 text-xs font-semibold text-slate-700 outline-none"
            >
              {availableYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <span className="border border-[#c6c6c6] bg-white px-2 py-1 text-[11px] text-slate-700">
              12 folders · Jan–Dec
            </span>
            <span className="border border-[#c6c6c6] bg-white px-2 py-1 text-[11px] text-slate-700">
              {totalInYear} job{totalInYear === 1 ? '' : 's'} in {selectedYear}
            </span>
          </div>
        }
      >
        <div className="flex min-h-0 overflow-hidden bg-white">
          <aside className="w-[220px] shrink-0 border-r border-[#d4d4d4]">
            <div className="border-b border-[#d4d4d4] bg-[#f2f2f2] px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
              {selectedYear} folders
            </div>
            <table className="w-full border-collapse text-xs">
              <thead className="bg-[#fafafa]">
                <tr>
                  <th className="border border-[#e0e0e0] px-2 py-1 text-left text-[10px] uppercase text-slate-500" />
                  <th className="border border-[#e0e0e0] px-2 py-1 text-left text-[10px] uppercase text-slate-500">
                    Month
                  </th>
                  <th className="border border-[#e0e0e0] px-2 py-1 text-right text-[10px] uppercase text-slate-500">
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
                        'cursor-pointer',
                        active ? 'bg-[#e2efda]' : 'hover:bg-[#fafafa]',
                      )}
                    >
                      <td className="border border-[#e0e0e0] px-2 py-1.5 text-center">
                        <Folder
                          className={cn(
                            'mx-auto h-3.5 w-3.5',
                            active ? 'text-[#217346]' : 'text-slate-400',
                          )}
                        />
                      </td>
                      <td className="border border-[#e0e0e0] px-2 py-1.5 font-medium text-slate-700">
                        {monthLabel}
                      </td>
                      <td className="border border-[#e0e0e0] px-2 py-1.5 text-right font-mono text-slate-800">
                        {count}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </aside>

          <section className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#d4d4d4] bg-[#e2efda] px-3 py-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#217346]">
                <ChevronRight className="h-4 w-4" />
                <span>{selectedMonthLabel} folder</span>
              </div>
              <span className="text-xs text-slate-600">
                {selectedMonthBatches.length} job
                {selectedMonthBatches.length === 1 ? '' : 's'} in {selectedMonthLabel}{' '}
                {selectedYear}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead className="bg-[#f8fafc]">
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
                        className="border border-[#e0e0e0] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
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
                        className="border border-[#e0e0e0] px-4 py-10 text-center text-slate-500"
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
                            'cursor-pointer even:bg-[#fafafa]',
                            selected && 'bg-[#e2efda]/60',
                          )}
                        >
                          <td className="border border-[#e0e0e0] px-3 py-2">
                            <div className="font-medium text-slate-900">{batch.sourceFileName}</div>
                          </td>
                          <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                            {formatBatchDate(batch.createdAt)}
                          </td>
                          <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                            {batch.processedProspects}/{batch.totalProspects}
                          </td>
                          <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                            {batch.emailsGenerated}
                          </td>
                          <td className="border border-[#e0e0e0] px-3 py-2">
                            <span
                              className={cn(
                                'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold',
                                STATUS_BADGE[batch.status],
                              )}
                            >
                              {STATUS_LABEL[batch.status]}
                            </span>
                          </td>
                          <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                            {batch.status === 'processing' ? (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200">
                                  <div
                                    className="h-full bg-[#217346]"
                                    style={{ width: `${batch.progress}%` }}
                                  />
                                </div>
                                <span className="text-xs">{batch.progress}%</span>
                              </div>
                            ) : batch.status === 'completed' ? (
                              batch.emailsGenerated > 0
                                ? `${batch.emailsGenerated} contacts · ${batch.verifiedCount} SMTP OK · ${batch.likelyValidCount ?? 0} likely`
                                : '0 contacts — Re-run after reset'
                            ) : (
                              '—'
                            )}
                          </td>
                          <td
                            className="border border-[#e0e0e0] px-3 py-2"
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
          <div className="flex w-full flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">Folder:</span>
            <span className="border border-[#c6c6c6] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
              {selectedMonthLabel} {selectedYear}
            </span>
            {selectedBatch && (
              <>
                <span className="font-medium text-slate-700">File:</span>
                <span className="border border-[#c6c6c6] bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700">
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
                  View uploaded file
                </button>
              </>
            )}
            <span className="text-slate-300">|</span>
            <span className="text-[11px] font-medium text-slate-600">Filter:</span>
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
              className="border border-[#c6c6c6] bg-white px-2 py-1 text-[11px] text-slate-700 outline-none"
              title="Minimum confidence score"
            >
              <option value="">All scores</option>
              <option value="80">Score 80+</option>
              <option value="95">Score 95+</option>
            </select>
            {canDownload && selectedBatch?.status === 'completed' ? (
              <>
                <button
                  type="button"
                  disabled={!selectedBatchId || exporting || statusFilters.length === 0}
                  onClick={() => void handleExportXlsx('status')}
                  className={shellBtn(
                    'border-[#217346] bg-[#217346] text-white hover:bg-[#1a5c38]',
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
                  Corrected email
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
        }
      >
        {diagnostics &&
        selectedBatch?.status === 'completed' &&
        diagnostics.verifiedCount === 0 ? (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-950">
            <p className="font-semibold">0 SMTP OK — this is not an SMTP password problem</p>
            <p className="mt-1 text-amber-900">
              Verification does not log in with a password. It only checks if the remote mail server
              accepts each email address (port 25). Your <code>BULK_EMAIL_SMTP_FROM</code> is just
              the sender address in that check.
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-4">
              {diagnostics.hints.map((hint) => (
                <li key={hint}>{hint}</li>
              ))}
            </ul>
            {diagnostics.topSmtpResponses.length > 0 ? (
              <p className="mt-2 font-medium">
                Server responses:{' '}
                {diagnostics.topSmtpResponses
                  .map((r) => `${r.response} (${r.count})`)
                  .join(' · ')}
              </p>
            ) : null}
            <p className="mt-2">
              Port 25 from API server:{' '}
              {diagnostics.port25.reachable ? (
                <span className="text-emerald-800">OK</span>
              ) : (
                <span className="text-red-800">{diagnostics.port25.message}</span>
              )}
            </p>
          </div>
        ) : null}

        <div className="overflow-x-auto bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-[#f2f2f2]">
              <tr>
                {[
                  'Name',
                  'Company',
                  'Domain',
                  'Best email',
                  'Corrected',
                  'Status',
                  'ZB',
                  'Score',
                ].map(
                  (label) => (
                    <th
                      key={label}
                      className="border border-[#c6c6c6] px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
                    >
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {!selectedBatchId ? (
                <tr>
                  <td
                    colSpan={8}
                    className="border border-[#e0e0e0] px-4 py-10 text-center text-slate-500"
                  >
                    <Mail className="mx-auto mb-2 h-6 w-6 text-slate-300" />
                    Select a job from the {selectedMonthLabel} folder to view email results.
                  </td>
                </tr>
              ) : recordsLoading && records.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="border border-[#e0e0e0] px-4 py-10 text-center text-slate-500"
                  >
                    <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-[#217346]" />
                    Loading results…
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                        className="border border-[#e0e0e0] px-4 py-10 text-center text-slate-500"
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
                              className="font-semibold text-[#217346] underline"
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
                  <tr key={r.id} className="even:bg-[#fafafa]">
                    <td className="border border-[#e0e0e0] px-3 py-2 whitespace-nowrap text-slate-900">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">
                      {r.companyName || '—'}
                    </td>
                    <td className="border border-[#e0e0e0] px-3 py-2 text-slate-700">{r.domain}</td>
                        <td className="border border-[#e0e0e0] px-3 py-2 font-mono text-xs font-semibold text-[#217346]">
                          {r.recommendedEmail || r.generatedEmail}
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2 font-mono text-xs text-slate-600">
                          {r.correctedEmail && r.correctedEmail !== r.generatedEmail
                            ? r.correctedEmail
                            : '—'}
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2">
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize',
                              RECORD_STATUS[r.verificationStatus],
                            )}
                          >
                            {formatStatus(r.verificationStatus)}
                          </span>
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2 text-xs text-slate-600">
                          {r.smtpResponse?.split('|')[0] ?? '—'}
                        </td>
                        <td className="border border-[#e0e0e0] px-3 py-2 font-semibold tabular-nums text-slate-900">
                          {r.confidenceScore}
                        </td>
                      </tr>
                    ))
                  )}
            </tbody>
          </table>
        </div>

        {recordTotal > 50 && (
          <div className="flex items-center justify-between border-t border-[#d4d4d4] bg-[#fafafa] px-3 py-2 text-xs text-slate-600">
            <span>
              Page {recordPage} of {Math.ceil(recordTotal / 50)} · {recordTotal} contacts
            </span>
            <div className="flex gap-1">
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
        title={pendingUpload ? `${pendingUpload.fileName} — review before upload` : 'Preview'}
        headers={pendingUpload?.headers ?? [...PROSPECT_HEADERS]}
        rows={pendingUpload?.rows ?? []}
        totalRows={pendingUpload?.rows.length}
        note="Email column → format check only (marked Valid). Company Domain → full SMTP/pattern verify. Valid contacts only."
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
