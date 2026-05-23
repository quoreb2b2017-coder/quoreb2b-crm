import { LegalPage } from '@/components/layout/LegalPage';

export const metadata = { title: 'Terms of Service | QuoreB2B CRM' };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        By using QuoreB2B CRM you agree to use the platform only for authorized business purposes
        and to keep your login credentials confidential.
      </p>
      <p>
        You are responsible for activity under your account. We may suspend access for violations of
        these terms or security policies.
      </p>
      <p>
        The service is provided as-is for enterprise use. Contact{' '}
        <a href="mailto:legal@quoreb2b.com" className="text-brand-600 hover:underline">
          legal@quoreb2b.com
        </a>{' '}
        for questions.
      </p>
      <p className="text-slate-400">Last updated: May 2026</p>
    </LegalPage>
  );
}
