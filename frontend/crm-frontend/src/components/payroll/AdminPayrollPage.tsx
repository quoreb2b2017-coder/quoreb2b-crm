'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Printer, RefreshCw, Save, Sparkles, Upload, Trash2 } from 'lucide-react';
import {
  DEFAULT_BRANDING_CLIENT,
  fileToDataUrl,
  formatInr,
  payrollService,
} from '@/lib/api/payroll.service';
import { extractApiError } from '@/lib/api/errors';
import { usersService } from '@/lib/api/users.service';
import { toast } from '@/stores/toast.store';
import type { EmployeeCompensationRow, Payslip, PayrollBranding } from '@/types/payroll';
import { SalarySlipDocument } from './SalarySlipDocument';
import './payroll-page.css';

type UserOption = { id: string; name: string; email: string; employeeId?: string };

const emptyForm = {
  userId: '',
  basicSalary: '',
  hra: '',
  specialAllowance: '',
  conveyance: '',
  otherAllowances: '',
  pfDeduction: '',
  professionalTax: '',
  otherDeductions: '',
  bankName: '',
  bankAccountNumber: '',
  ifscCode: '',
  panNumber: '',
  designation: '',
  department: '',
};

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formFromRow(row: EmployeeCompensationRow) {
  return {
    userId: row.userId,
    basicSalary: String(row.basicSalary ?? ''),
    hra: String(row.hra ?? ''),
    specialAllowance: String(row.specialAllowance ?? ''),
    conveyance: String(row.conveyance ?? ''),
    otherAllowances: String(row.otherAllowances ?? ''),
    pfDeduction: String(row.pfDeduction ?? ''),
    professionalTax: String(row.professionalTax ?? ''),
    otherDeductions: String(row.otherDeductions ?? ''),
    bankName: row.bankName ?? '',
    bankAccountNumber: row.bankAccountNumber ?? '',
    ifscCode: row.ifscCode ?? '',
    panNumber: row.panNumber ?? '',
    designation: row.designation ?? '',
    department: row.department ?? '',
  };
}

export function AdminPayrollPage() {
  const now = new Date();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [rows, setRows] = useState<EmployeeCompensationRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [branding, setBranding] = useState<PayrollBranding>(DEFAULT_BRANDING_CLIENT);
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [genUserId, setGenUserId] = useState('');
  const [preview, setPreview] = useState<Payslip | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingBrand, setSavingBrand] = useState(false);
  const [savingSalary, setSavingSalary] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [comps, brand, team] = await Promise.all([
        payrollService.listCompensations(),
        payrollService.getBranding(),
        usersService.listTeamMembers(),
      ]);
      setRows(comps);
      setBranding({ ...DEFAULT_BRANDING_CLIENT, ...brand });
      setUsers(
        team
          .map((u) => ({
            id: String(u.id ?? ''),
            name:
              `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim() ||
              String(u.email ?? 'Employee'),
            email: String(u.email ?? ''),
            employeeId: undefined,
          }))
          .filter((u) => u.id)
          .sort((a, b) => a.name.localeCompare(b.name)),
      );
      setError('');
    } catch (e) {
      setError(extractApiError(e, 'Failed to load payroll setup'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectEmployee = (userId: string) => {
    const existing = rows.find((r) => r.userId === userId);
    if (existing) {
      setForm(formFromRow(existing));
    } else {
      setForm({ ...emptyForm, userId });
    }
    setGenUserId(userId);
  };

  const editRow = (row: EmployeeCompensationRow) => {
    setForm(formFromRow(row));
    setGenUserId(row.userId);
  };

  const liveGross = useMemo(() => {
    return (
      num(form.basicSalary) +
      num(form.hra) +
      num(form.specialAllowance) +
      num(form.conveyance) +
      num(form.otherAllowances)
    );
  }, [form]);

  const saveCompensation = async () => {
    if (!form.userId) {
      setError('Select an employee');
      toast.error('Select an employee first');
      return;
    }
    if (num(form.basicSalary) <= 0) {
      setError('Basic salary must be greater than 0');
      toast.error('Basic salary must be greater than 0');
      return;
    }
    setSavingSalary(true);
    setError('');
    try {
      await payrollService.upsertCompensation({
        userId: form.userId,
        basicSalary: num(form.basicSalary),
        hra: num(form.hra),
        specialAllowance: num(form.specialAllowance),
        conveyance: num(form.conveyance),
        otherAllowances: num(form.otherAllowances),
        pfDeduction: num(form.pfDeduction),
        professionalTax: num(form.professionalTax),
        otherDeductions: num(form.otherDeductions),
        bankName: form.bankName,
        bankAccountNumber: form.bankAccountNumber,
        ifscCode: form.ifscCode,
        panNumber: form.panNumber,
        designation: form.designation,
        department: form.department,
      });
      toast.success('Salary structure saved');
      await load();
    } catch (e) {
      const msg = extractApiError(e, 'Could not save salary');
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingSalary(false);
    }
  };

  const generate = async () => {
    const userId = genUserId || form.userId;
    if (!userId) {
      setError('Select employee to generate slip');
      toast.error('Select employee to generate slip');
      return;
    }
    const hasStructure = rows.some((r) => r.userId === userId);
    if (!hasStructure) {
      setError('Save salary structure for this employee first');
      toast.error('Save salary structure for this employee first');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const slip = await payrollService.generatePayslip({ userId, year, month });
      setPreview(slip);
      toast.success('Salary slip generated — also saved in store');
    } catch (e) {
      const msg = extractApiError(e, 'Could not generate salary slip');
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  };

  const uploadAsset = async (kind: 'logo' | 'sign' | 'stamp', file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      const payload =
        kind === 'logo'
          ? { logoDataUrl: dataUrl }
          : kind === 'sign'
            ? { signDataUrl: dataUrl }
            : { stampDataUrl: dataUrl };
      const next = await payrollService.updateBranding(payload);
      setBranding(next);
      toast.success(
        `${kind === 'logo' ? 'Logo' : kind === 'sign' ? 'Signature' : 'Stamp'} uploaded`,
      );
    } catch (e) {
      toast.error(extractApiError(e, 'Upload failed'));
    }
  };

  const clearAsset = async (kind: 'logo' | 'sign' | 'stamp') => {
    try {
      const payload =
        kind === 'logo'
          ? { clearLogo: true }
          : kind === 'sign'
            ? { clearSign: true }
            : { clearStamp: true };
      const next = await payrollService.updateBranding(payload);
      setBranding(next);
      toast.success('Removed');
    } catch (e) {
      toast.error(extractApiError(e, 'Could not remove asset'));
    }
  };

  const saveBrandingText = async () => {
    setSavingBrand(true);
    setError('');
    try {
      const next = await payrollService.updateBranding({
        companyName: branding.companyName || 'QuoreB2B CRM',
        companyAddress: branding.companyAddress ?? '',
        companyEmail: branding.companyEmail ?? '',
        companyPhone: branding.companyPhone ?? '',
        authorizedSignatoryName: branding.authorizedSignatoryName ?? '',
        authorizedSignatoryTitle: branding.authorizedSignatoryTitle ?? '',
      });
      setBranding(next);
      toast.success('Payroll branding saved');
    } catch (e) {
      const msg = extractApiError(e, 'Could not save branding');
      setError(msg);
      toast.error(msg);
    } finally {
      setSavingBrand(false);
    }
  };

  const monthOptions = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        value: i + 1,
        label: new Date(2000, i, 1).toLocaleString('en', { month: 'long' }),
      })),
    [],
  );

  const setBrandField = <K extends keyof PayrollBranding>(key: K, value: PayrollBranding[K]) => {
    setBranding((b) => ({ ...b, [key]: value }));
  };

  return (
    <div className="payroll-page">
      <header className="payroll-page__hero">
        <div>
          <p className="payroll-page__eyebrow">Salary · Admin</p>
          <h1>Payroll setup</h1>
          <p>
            1) Branding → 2) Employee salary → 3) Generate monthly slip. Generated slips go to the
            salary slip store.
          </p>
        </div>
        <div className="payroll-gen-controls">
          <Link href="/admin/salary-slips/store" className="payroll-btn ghost">
            Open store
          </Link>
          <Link href="/admin/salary-slips/demo" className="payroll-btn ghost">
            Demo template
          </Link>
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

      <div className="payroll-grid">
        <section className="payroll-card">
          <h2>1. Company branding</h2>
          <p className="payroll-card__sub">
            Logo optional — slips use Quore navbar logo when empty. Signature & stamp apply on every
            slip.
          </p>
          <div className="payroll-form">
            <label>
              Company name
              <input
                value={branding.companyName}
                onChange={(e) => setBrandField('companyName', e.target.value)}
                placeholder="QuoreB2B CRM"
              />
            </label>
            <label className="span-2">
              Address
              <input
                value={branding.companyAddress}
                onChange={(e) => setBrandField('companyAddress', e.target.value)}
                placeholder="Office address"
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={branding.companyEmail ?? ''}
                onChange={(e) => setBrandField('companyEmail', e.target.value)}
                placeholder="hr@quoreb2b.com"
              />
            </label>
            <label>
              Phone
              <input
                value={branding.companyPhone ?? ''}
                onChange={(e) => setBrandField('companyPhone', e.target.value)}
                placeholder="+91 …"
              />
            </label>
            <label>
              Signatory name
              <input
                value={branding.authorizedSignatoryName ?? ''}
                onChange={(e) => setBrandField('authorizedSignatoryName', e.target.value)}
              />
            </label>
            <label>
              Signatory title
              <input
                value={branding.authorizedSignatoryTitle ?? ''}
                onChange={(e) => setBrandField('authorizedSignatoryTitle', e.target.value)}
              />
            </label>
          </div>
          <div className="payroll-assets">
            {(['logo', 'sign', 'stamp'] as const).map((kind) => {
              const src =
                kind === 'logo'
                  ? branding.logoDataUrl
                  : kind === 'sign'
                    ? branding.signDataUrl
                    : branding.stampDataUrl;
              return (
                <div key={kind} className="payroll-asset">
                  <span>{kind === 'logo' ? 'Logo' : kind === 'sign' ? 'Signature' : 'Stamp'}</span>
                  {src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt={kind} />
                  ) : (
                    <em>{kind === 'logo' ? 'Uses Quore logo' : 'Not uploaded'}</em>
                  )}
                  <div className="payroll-asset__actions">
                    <label className="payroll-btn tiny">
                      <Upload className="h-3.5 w-3.5" />
                      Upload
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(e) => {
                          void uploadAsset(kind, e.target.files?.[0] ?? null);
                          e.target.value = '';
                        }}
                      />
                    </label>
                    {src ? (
                      <button
                        type="button"
                        className="payroll-btn tiny ghost"
                        onClick={() => void clearAsset(kind)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <button
            type="button"
            className="payroll-btn primary"
            onClick={() => void saveBrandingText()}
            disabled={savingBrand}
          >
            {savingBrand ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save branding
          </button>
        </section>

        <section className="payroll-card">
          <h2>2. Employee salary structure</h2>
          <p className="payroll-card__sub">
            Select employee, enter CTC components, then save. Live gross:{' '}
            <strong>{formatInr(liveGross)}</strong>
          </p>
          <div className="payroll-form">
            <label className="span-2">
              Employee
              <select
                value={form.userId}
                onChange={(e) => selectEmployee(e.target.value)}
                disabled={loading}
              >
                <option value="">Select employee…</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                    {u.email ? ` · ${u.email}` : ''}
                  </option>
                ))}
              </select>
            </label>
            {(
              [
                ['basicSalary', 'Basic *'],
                ['hra', 'HRA'],
                ['specialAllowance', 'Special allowance'],
                ['conveyance', 'Conveyance'],
                ['otherAllowances', 'Other allowances'],
                ['pfDeduction', 'PF deduction'],
                ['professionalTax', 'Professional tax'],
                ['otherDeductions', 'Other deductions'],
              ] as const
            ).map(([key, label]) => (
              <label key={key}>
                {label}
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <label>
              Designation
              <input
                value={form.designation}
                onChange={(e) => setForm((f) => ({ ...f, designation: e.target.value }))}
              />
            </label>
            <label>
              Department
              <input
                value={form.department}
                onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))}
              />
            </label>
            <label>
              Bank
              <input
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
              />
            </label>
            <label>
              Account no.
              <input
                value={form.bankAccountNumber}
                onChange={(e) => setForm((f) => ({ ...f, bankAccountNumber: e.target.value }))}
              />
            </label>
            <label>
              IFSC
              <input
                value={form.ifscCode}
                onChange={(e) => setForm((f) => ({ ...f, ifscCode: e.target.value }))}
              />
            </label>
            <label>
              PAN
              <input
                value={form.panNumber}
                onChange={(e) => setForm((f) => ({ ...f, panNumber: e.target.value }))}
              />
            </label>
          </div>
          <button
            type="button"
            className="payroll-btn primary"
            onClick={() => void saveCompensation()}
            disabled={savingSalary || !form.userId}
          >
            {savingSalary ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save salary
          </button>

          <div className="payroll-table-wrap">
            <table className="payroll-table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Gross</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId}>
                    <td>
                      <strong>{r.employeeName}</strong>
                      <span>{r.email}</span>
                    </td>
                    <td>{formatInr(r.monthlyGross)}</td>
                    <td>
                      <button type="button" className="payroll-btn tiny" onClick={() => editRow(r)}>
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={3}>No salary structures yet — pick an employee and save.</td>
                  </tr>
                ) : null}
                {loading ? (
                  <tr>
                    <td colSpan={3}>Loading…</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="payroll-card">
        <div className="payroll-gen-bar">
          <h2>3. Generate monthly slip</h2>
          <div className="payroll-gen-controls">
            <select
              value={genUserId || form.userId}
              onChange={(e) => {
                setGenUserId(e.target.value);
                if (e.target.value) selectEmployee(e.target.value);
              }}
            >
              <option value="">Employee with salary…</option>
              {rows.map((r) => (
                <option key={r.userId} value={r.userId}>
                  {r.employeeName}
                </option>
              ))}
            </select>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={year}
              min={2020}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value))}
            />
            <button
              type="button"
              className="payroll-btn primary"
              onClick={() => void generate()}
              disabled={generating || rows.length === 0}
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Generate
            </button>
            {preview ? (
              <>
                <button type="button" className="payroll-btn" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" />
                  Print
                </button>
                <Link href="/admin/salary-slips/store" className="payroll-btn ghost">
                  View in store
                </Link>
              </>
            ) : null}
          </div>
        </div>

        {preview ? (
          <div className="payroll-preview">
            <SalarySlipDocument payslip={preview} branding={preview.branding ?? branding} />
          </div>
        ) : (
          <p className="payroll-empty">
            {rows.length === 0
              ? 'Save at least one employee salary structure, then generate a slip here.'
              : 'Select employee + month, then Generate. Slip is saved to the store automatically.'}
          </p>
        )}
      </section>
    </div>
  );
}
