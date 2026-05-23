import { LegalPage } from '@/components/layout/LegalPage';

export const metadata = { title: 'Cookie Policy | QuoreB2B CRM' };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>
        QuoreB2B CRM uses essential cookies and local storage to maintain your session after sign-in
        (for example, authentication tokens). These are required for the application to function.
      </p>
      <p>
        We do not use third-party advertising cookies on the CRM portal. Analytics cookies, if
        enabled, are used only to improve product reliability and performance.
      </p>
      <p>
        You can clear cookies via your browser settings; you will need to sign in again afterward.
      </p>
      <p className="text-slate-400">Last updated: May 2026</p>
    </LegalPage>
  );
}
