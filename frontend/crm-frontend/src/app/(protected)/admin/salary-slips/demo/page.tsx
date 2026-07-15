'use client';

import Link from 'next/link';
import { ArrowLeft, Printer } from 'lucide-react';
import { SalarySlipDocument } from '@/components/payroll/SalarySlipDocument';
import { DEMO_PAYROLL_BRANDING, DEMO_PAYSLIP } from '@/components/payroll/demo-payslip';
import './demo-page.css';

export default function SalarySlipDemoPage() {
  return (
    <div className="ss-demo">
      <header className="ss-demo__bar">
        <div>
          <p>Preview</p>
          <h1>Dummy salary slip template</h1>
          <span>Sample layout — real slips will look like this</span>
        </div>
        <div className="ss-demo__actions">
          <Link href="/admin/salary-slips" className="ss-demo__btn">
            <ArrowLeft size={16} />
            Back
          </Link>
          <button type="button" className="ss-demo__btn ss-demo__btn--primary" onClick={() => window.print()}>
            <Printer size={16} />
            Print
          </button>
        </div>
      </header>

      <div className="ss-demo__sheet">
        <SalarySlipDocument payslip={DEMO_PAYSLIP} branding={DEMO_PAYROLL_BRANDING} />
      </div>
    </div>
  );
}
