'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, Folder, Loader2, RefreshCw } from 'lucide-react';
import { payrollService, formatInr } from '@/lib/api/payroll.service';
import { extractApiError } from '@/lib/api/errors';
import type { Payslip, PayrollBranding } from '@/types/payroll';
import { SalarySlipDocument } from './SalarySlipDocument';
import './payroll-page.css';

type EmployeeFolder = {
  userId: string;
  employeeName: string;
  employeeId: string;
  email: string;
  slips: Payslip[];
};

export function AdminSalarySlipStorePage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | ''>('');
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [branding, setBranding] = useState<PayrollBranding | null>(null);
  const [selected, setSelected] = useState<Payslip | null>(null);
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await payrollService.listPayslips({
        year,
        month: month === '' ? undefined : month,
      });
      setSlips(res.data);
      setBranding(res.branding ?? null);
      setError('');
      const next: Record<string, boolean> = {};
      for (const s of res.data) next[s.userId] = true;
      setOpenFolders(next);
      setSelected((prev) => (prev ? res.data.find((s) => s.id === prev.id) ?? null : null));
    } catch (e) {
      setError(extractApiError(e, 'Failed to load salary slip store'));
    } finally {
      setLoading(false);
    }
  }, [year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const folders = useMemo<EmployeeFolder[]>(() => {
    const map = new Map<string, EmployeeFolder>();
    for (const slip of slips) {
      const existing = map.get(slip.userId);
      if (existing) {
        existing.slips.push(slip);
      } else {
        map.set(slip.userId, {
          userId: slip.userId,
          employeeName: slip.employeeName,
          employeeId: slip.employeeId,
          email: slip.email,
          slips: [slip],
        });
      }
    }
    return [...map.values()].sort((a, b) =>
      a.employeeName.localeCompare(b.employeeName, undefined, { sensitivity: 'base' }),
    );
  }, [slips]);

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: new Date(2000, i, 1).toLocaleString('en', { month: 'long' }),
      })),
    [],
  );

  const toggleFolder = (userId: string) => {
    setOpenFolders((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };

  return (
    <div className="payroll-page">
      <header className="payroll-page__hero">
        <div>
          <p className="payroll-page__eyebrow">Salary · Admin store</p>
          <h1>Salary slip store</h1>
          <p>All generated employee salary slips, organised by employee folders.</p>
        </div>
        <div className="payroll-gen-controls">
          <Link href="/admin/salary-slips" className="payroll-btn ghost">
            Payroll setup
          </Link>
          <select value={month} onChange={(e) => setMonth(e.target.value ? Number(e.target.value) : '')}>
            <option value="">All months</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={2020}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
          <button type="button" className="payroll-btn ghost" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </button>
        </div>
      </header>

      {error ? <p className="payroll-alert">{error}</p> : null}

      <div className="payroll-store">
        <section className="payroll-card payroll-store__tree">
          <h2>Employee folders</h2>
          <p className="payroll-card__sub">
            {loading
              ? 'Loading…'
              : `${folders.length} employee${folders.length === 1 ? '' : 's'} · ${slips.length} slip${slips.length === 1 ? '' : 's'}`}
          </p>

          {loading && slips.length === 0 ? (
            <p className="payroll-empty">Loading store…</p>
          ) : folders.length === 0 ? (
            <p className="payroll-empty">
              No slips for this filter yet. Generate them from{' '}
              <Link href="/admin/salary-slips">Payroll setup</Link>.
            </p>
          ) : (
            <ul className="payroll-folder-list">
              {folders.map((folder) => {
                const open = openFolders[folder.userId] !== false;
                return (
                  <li key={folder.userId} className="payroll-folder">
                    <button
                      type="button"
                      className="payroll-folder__head"
                      onClick={() => toggleFolder(folder.userId)}
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4" />
                      ) : (
                        <ChevronRight className="h-4 w-4" />
                      )}
                      <Folder className="h-4 w-4 payroll-folder__icon" />
                      <span className="payroll-folder__name">
                        <strong>{folder.employeeName}</strong>
                        <em>
                          {folder.employeeId || folder.email}
                          {' · '}
                          {folder.slips.length} slip{folder.slips.length === 1 ? '' : 's'}
                        </em>
                      </span>
                    </button>
                    {open ? (
                      <ul className="payroll-folder__slips">
                        {folder.slips.map((slip) => {
                          const active = selected?.id === slip.id;
                          return (
                            <li key={slip.id}>
                              <button
                                type="button"
                                className={`payroll-folder__slip${active ? ' is-active' : ''}`}
                                onClick={() => setSelected(slip)}
                              >
                                <span>{slip.periodLabel}</span>
                                <strong>{formatInr(slip.netPay)}</strong>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="payroll-store__preview">
          {selected ? (
            <SalarySlipDocument
              payslip={selected}
              branding={selected.branding ?? branding}
            />
          ) : (
            <div className="payroll-card">
              <p className="payroll-empty">Select a slip from an employee folder to preview & download.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
