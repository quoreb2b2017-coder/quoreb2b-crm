'use client';

import { useRef, useState } from 'react';
import { Download, Loader2 } from 'lucide-react';
import type { Payslip, PayrollBranding } from '@/types/payroll';
import { formatInr } from '@/lib/api/payroll.service';
import { downloadPayslipPdf, payslipFileName } from '@/lib/payroll/download-payslip-pdf';
import './salary-slip.css';

interface SalarySlipDocumentProps {
  payslip: Payslip;
  branding?: PayrollBranding | null;
  /** Show download PDF button above the slip */
  showDownload?: boolean;
}

export function SalarySlipDocument({
  payslip,
  branding,
  showDownload = true,
}: SalarySlipDocumentProps) {
  const brand = branding ?? payslip.branding;
  const rootRef = useRef<HTMLElement>(null);
  const [downloading, setDownloading] = useState(false);
  const e = payslip.earnings;
  const d = payslip.deductions;
  const a = payslip.attendance;
  const generated = payslip.generatedAt
    ? new Date(payslip.generatedAt).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '—';

  const customLogo = brand?.logoDataUrl;
  const companyName = brand?.companyName || 'QuoreB2B';

  const earningsRows = [
    { label: 'Basic salary', amount: e.basic },
    { label: 'HRA', amount: e.hra },
    { label: 'Special allowance', amount: e.specialAllowance },
    { label: 'Conveyance', amount: e.conveyance },
    { label: 'Other allowances', amount: e.otherAllowances },
  ].filter((r) => r.amount > 0 || r.label === 'Basic salary' || r.label === 'HRA');

  const deductionRows = [
    { label: 'Provident fund', amount: d.pf },
    { label: 'Professional tax', amount: d.professionalTax },
    { label: 'Other deductions', amount: d.other },
  ].filter((r) => r.amount > 0 || r.label === 'Provident fund');

  const onDownload = async () => {
    setDownloading(true);
    try {
      await downloadPayslipPdf(
        rootRef.current,
        payslipFileName(payslip.periodLabel, payslip.employeeName),
      );
    } catch (err) {
      console.error(err);
      window.alert(err instanceof Error ? err.message : 'PDF download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="salary-slip-wrap">
      {showDownload ? (
        <div className="salary-slip-toolbar no-print">
          <button
            type="button"
            className="salary-slip-download"
            onClick={() => void onDownload()}
            disabled={downloading}
          >
            {downloading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {downloading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
        </div>
      ) : null}

      <article className="salary-slip" id="salary-slip-print" ref={rootRef}>
        <div className="salary-slip__accent-bar" aria-hidden />

        <header className="salary-slip__head">
          <div className="salary-slip__brand">
            {customLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={customLogo} alt="" className="salary-slip__logo" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src="/brand/quore-logo.jpg"
                alt="QuoreB2B"
                className="salary-slip__logo salary-slip__logo--mark"
                width={40}
                height={40}
              />
            )}
            <div className="salary-slip__brand-text">
              <h1 className="salary-slip__wordmark">
                <span className="salary-slip__wordmark-dark">
                  {customLogo ? companyName : 'QuoreB2B'}
                </span>
              </h1>
              {brand?.companyAddress ? <p>{brand.companyAddress}</p> : null}
              {(brand?.companyEmail || brand?.companyPhone) ? (
                <p className="salary-slip__contact">
                  {[brand.companyEmail, brand.companyPhone].filter(Boolean).join('  ·  ')}
                </p>
              ) : null}
            </div>
          </div>
          <div className="salary-slip__doc-title">
            <span>Payslip</span>
            <strong>{payslip.periodLabel}</strong>
            <em>Issue · {generated}</em>
          </div>
        </header>

        <div className="salary-slip__ribbon">
          <span>Confidential</span>
          <span>{payslip.periodLabel}</span>
        </div>

        <section className="salary-slip__employee">
          <h2>Employee details</h2>
          <div className="salary-slip__employee-grid">
            <div>
              <span>Name</span>
              <strong>{payslip.employeeName}</strong>
            </div>
            <div>
              <span>Employee ID</span>
              <strong>{payslip.employeeId || '—'}</strong>
            </div>
            <div>
              <span>Designation</span>
              <strong>{payslip.designation || '—'}</strong>
            </div>
            <div>
              <span>Department</span>
              <strong>{payslip.department || '—'}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{payslip.email || '—'}</strong>
            </div>
            <div>
              <span>PAN</span>
              <strong>{payslip.panNumber || '—'}</strong>
            </div>
            <div>
              <span>Bank</span>
              <strong>{payslip.bankName || '—'}</strong>
            </div>
            <div>
              <span>Account</span>
              <strong>
                {payslip.bankAccountNumber
                  ? `XXXX ${payslip.bankAccountNumber.slice(-4)}`
                  : '—'}
              </strong>
            </div>
          </div>
        </section>

        <section className="salary-slip__attendance">
          <h2>Attendance</h2>
          <table className="salary-slip__att-table">
            <thead>
              <tr>
                <th>Working</th>
                <th>Present</th>
                <th>Half</th>
                <th>Paid leave</th>
                <th>Payable</th>
                <th>LOP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{a.workingDays}</td>
                <td>{a.presentDays}</td>
                <td>{a.halfDays}</td>
                <td>{a.paidLeaveDays}</td>
                <td>{a.payableDays}</td>
                <td>{a.lopDays}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="salary-slip__grid">
          <div className="salary-slip__panel">
            <div className="salary-slip__panel-head salary-slip__panel-head--earn">Earnings</div>
            <table>
              <thead>
                <tr>
                  <th>Particulars</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {earningsRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{formatInr(row.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>Gross</td>
                  <td>{formatInr(e.gross)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="salary-slip__panel">
            <div className="salary-slip__panel-head salary-slip__panel-head--ded">Deductions</div>
            <table>
              <thead>
                <tr>
                  <th>Particulars</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {deductionRows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>{formatInr(row.amount)}</td>
                  </tr>
                ))}
                {d.lossOfPay > 0 ? (
                  <tr>
                    <td>LOP (not paid)</td>
                    <td>{formatInr(d.lossOfPay)}</td>
                  </tr>
                ) : null}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td>{formatInr(d.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>

        <section className="salary-slip__net">
          <div className="salary-slip__net-box">
            <div>
              <span>Net salary payable</span>
              <em>{payslip.netPayInWords}</em>
            </div>
            <strong>{formatInr(payslip.netPay)}</strong>
          </div>
        </section>

        <footer className="salary-slip__footer">
          <div className="salary-slip__note">
            <p>
              System-generated payslip. Earnings prorated on payable attendance. Report issues to HR
              within 7 days.
            </p>
            {payslip.ifscCode ? <p>IFSC · {payslip.ifscCode}</p> : null}
          </div>
          <div className="salary-slip__sign-block">
            {brand?.stampDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brand.stampDataUrl} alt="" className="salary-slip__stamp" />
            ) : null}
            <div className="salary-slip__sign">
              {brand?.signDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={brand.signDataUrl} alt="" className="salary-slip__sign-img" />
              ) : (
                <div className="salary-slip__sign-line" />
              )}
              <strong>{brand?.authorizedSignatoryName || 'Authorized Signatory'}</strong>
              <span>{brand?.authorizedSignatoryTitle || 'HR / Accounts'}</span>
            </div>
          </div>
        </footer>

        <div className="salary-slip__bottom-bar" aria-hidden />
      </article>
    </div>
  );
}
