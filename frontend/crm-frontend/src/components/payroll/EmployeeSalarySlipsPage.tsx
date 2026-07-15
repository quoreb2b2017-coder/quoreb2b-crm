'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  FileText,
  Folder,
  FolderOpen,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { formatInr, payrollService } from '@/lib/api/payroll.service';
import { extractApiError } from '@/lib/api/errors';
import type { Payslip, PayrollBranding } from '@/types/payroll';
import { SalarySlipDocument } from './SalarySlipDocument';
import './payroll-page.css';

export function EmployeeSalarySlipsPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [salaryOpen, setSalaryOpen] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [history, setHistory] = useState<Payslip[]>([]);
  const [branding, setBranding] = useState<PayrollBranding | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await payrollService.listPayslips({ year });
      // Newest month first
      const sorted = [...list.data].sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.month - a.month;
      });
      setHistory(sorted);
      setBranding(list.branding ?? null);
      setError('');
      setSalaryOpen(true);
      setActiveId((prev) => {
        if (prev && sorted.some((s) => s.id === prev)) return prev;
        return sorted[0]?.id ?? null;
      });
    } catch (e) {
      setError(extractApiError(e, 'Failed to load salary slips'));
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeSlip = useMemo(
    () => history.find((s) => s.id === activeId) ?? null,
    [history, activeId],
  );

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2, y - 3];
  }, []);

  return (
    <div className="payroll-page">
      <header className="payroll-page__hero">
        <div>
          <p className="payroll-page__eyebrow">Salary</p>
          <h1>My salary slips</h1>
          <p>
            Ek <strong>Salary</strong> folder — andar sirf saved month slips. Jaise generate
            hote hain, waisi files save hoti jaati hain.
          </p>
        </div>
        <div className="payroll-gen-controls">
          <label className="payroll-year-pick">
            Year
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Salary year"
            >
              {yearOptions.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="payroll-btn ghost"
            onClick={() => void load()}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </header>

      {error ? <p className="payroll-alert">{error}</p> : null}

      <div className="payroll-store payroll-employee-store">
        <aside className="payroll-card payroll-store__tree">
          <button
            type="button"
            className="payroll-salary-root"
            onClick={() => setSalaryOpen((v) => !v)}
            aria-expanded={salaryOpen}
          >
            {salaryOpen ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            {salaryOpen ? (
              <FolderOpen className="h-5 w-5 payroll-salary-root__icon" />
            ) : (
              <Folder className="h-5 w-5 payroll-salary-root__icon" />
            )}
            <span className="payroll-salary-root__text">
              <strong>Salary</strong>
              <em>
                {year} · {loading ? '…' : `${history.length} file${history.length === 1 ? '' : 's'}`}
              </em>
            </span>
          </button>

          {salaryOpen ? (
            loading ? (
              <p className="payroll-card__sub" style={{ marginTop: '0.65rem' }}>
                Loading…
              </p>
            ) : history.length === 0 ? (
              <p className="payroll-card__sub" style={{ marginTop: '0.65rem' }}>
                Salary folder empty hai. Jab admin slip generate karega, file yahan save hogi.
              </p>
            ) : (
              <ul className="payroll-month-side-list payroll-month-side-list--nested">
                {history.map((slip) => {
                  const active = activeId === slip.id;
                  return (
                    <li key={slip.id}>
                      <button
                        type="button"
                        className={`payroll-month-side is-ready${active ? ' is-active' : ''}`}
                        onClick={() => setActiveId(slip.id)}
                      >
                        <span className="payroll-month-side__icon">
                          <FileText className="h-4 w-4" />
                        </span>
                        <span className="payroll-month-side__text">
                          <strong>{slip.periodLabel}</strong>
                          <em>{formatInr(slip.netPay)}</em>
                        </span>
                        <Download className="h-3.5 w-3.5 payroll-month-side__dl" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )
          ) : (
            <p className="payroll-card__sub" style={{ marginTop: '0.65rem' }}>
              Salary folder band hai — open karke files dekho.
            </p>
          )}
        </aside>

        <section className="payroll-store__preview">
          {loading ? (
            <div className="payroll-card">
              <p className="payroll-empty">Loading…</p>
            </div>
          ) : activeSlip ? (
            <SalarySlipDocument
              payslip={activeSlip}
              branding={activeSlip.branding ?? branding}
              showDownload
            />
          ) : (
            <div className="payroll-card">
              <p className="payroll-empty">
                <Folder className="mx-auto mb-2 h-8 w-8 text-[#00d19e] opacity-60" />
                <strong>Salary</strong> folder mein abhi koi file nahi.
                <br />
                Month ke hisaab se slip generate hone par yahan save hoti jayegi.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
