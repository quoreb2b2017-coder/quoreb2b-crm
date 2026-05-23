import { LegalPage } from '@/components/layout/LegalPage';

export const metadata = { title: 'Privacy Policy | QuoreB2B CRM' };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        QuoreB2B CRM collects and processes personal data only as needed to provide the service,
        including account credentials, activity logs, and business data you enter into the platform.
      </p>
      <p>
        We do not sell your data. Access is restricted by role-based permissions. Data is stored on
        secure infrastructure with encryption in transit and at rest where applicable.
      </p>
      <p>
        For privacy-related requests, contact{' '}
        <a href="mailto:privacy@quoreb2b.com" className="text-brand-600 hover:underline">
          privacy@quoreb2b.com
        </a>
        .
      </p>
      <p className="text-slate-400">Last updated: May 2026</p>
    </LegalPage>
  );
}
