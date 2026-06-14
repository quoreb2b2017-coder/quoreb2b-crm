'use client';

import { useEffect, useState } from 'react';
import { clearSleepLogoutFlag } from '@/lib/auth/sleep-logout';
import { useSearchParams } from 'next/navigation';
import { Shield, Database, Users, BarChart3, Bell, Lock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { PublicNavbar } from '@/components/layout/PublicNavbar';
import { PublicFooter } from '@/components/layout/PublicFooter';
import { AdminLoginForm } from './AdminLoginForm';
import { IdLoginForm } from './IdLoginForm';
import { LoginProvider } from './LoginProvider';
import type { LoginPanel } from '@/types/auth';
import { IDLE_TIMEOUT_MINUTES } from '@/lib/constants/session';

const tabs: { id: LoginPanel; label: string; icon: typeof Shield }[] = [
  { id: 'admin', label: 'Super Admin', icon: Shield },
  { id: 'db_admin', label: 'DB Administrator', icon: Database },
  { id: 'employee', label: 'Employee', icon: Users },
];

const features = [
  { icon: BarChart3, title: 'Role-based dashboards', desc: 'Tailored KPIs and workflows per role.' },
  { icon: Bell, title: 'Real-time alerts', desc: 'Instant updates on leads and campaigns.' },
  { icon: Lock, title: 'Enterprise security', desc: 'JWT, RBAC, OTP, and audit trails.' },
];

export function LoginHub() {
  const [active, setActive] = useState<LoginPanel>('admin');
  const searchParams = useSearchParams();
  const logoutReason = searchParams.get('reason');

  useEffect(() => {
    clearSleepLogoutFlag();
  }, []);

  return (
    <LoginProvider>
    <div className="flex min-h-screen flex-col bg-white">
      <PublicNavbar />

      {(logoutReason === 'idle' || logoutReason === 'sleep') && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm text-amber-900">
          {logoutReason === 'sleep'
            ? 'You were signed out because your PC slept or the screen was locked. Please sign in again.'
            : `You were signed out after ${IDLE_TIMEOUT_MINUTES} minutes of inactivity. Please sign in again.`}
        </div>
      )}

      <main className="flex-1">
        <section className="border-b border-slate-100">
          <div className="mx-auto grid max-w-7xl items-start gap-12 px-4 pt-10 pb-16 sm:px-6 lg:grid-cols-2 lg:gap-20 lg:px-8 lg:pt-12 lg:pb-20">
            <div className="flex flex-col">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
                Enterprise portal
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                QuoreB2B CRM
              </h1>
              <p className="mt-5 max-w-md text-base leading-relaxed text-slate-600">
                Secure sign-in for administrators, database teams, and employees. One gateway for
                your entire organization.
              </p>

              <ul className="mt-12 space-y-6 border-t border-slate-100 pt-10">
                {features.map((f) => {
                  const Icon = f.icon;
                  return (
                    <li key={f.title} className="flex gap-4">
                      <Icon className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" strokeWidth={1.5} />
                      <div>
                        <p className="font-medium text-slate-900">{f.title}</p>
                        <p className="mt-1 text-sm text-slate-500">{f.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div id="sign-in" className="flex flex-col lg:border-l lg:border-slate-100 lg:pl-16">
              <h2 className="text-2xl font-semibold text-slate-900">Sign in</h2>
              <p className="mt-1 text-sm text-slate-500">Select your role and enter credentials</p>

              <nav
                className="mt-8 flex gap-6 border-b border-slate-200"
                aria-label="Sign in role"
              >
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = active === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActive(tab.id)}
                      className={cn(
                        'flex items-center gap-2 border-b-2 pb-3 text-sm font-medium transition-colors -mb-px',
                        isActive
                          ? 'border-slate-900 text-slate-900'
                          : 'border-transparent text-slate-500 hover:text-slate-700',
                      )}
                    >
                      <Icon className="h-4 w-4" strokeWidth={1.75} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>

              <div className="mt-10 max-w-md animate-slide-up" key={active}>
                {active === 'admin' && <AdminLoginForm />}
                {active === 'db_admin' && <IdLoginForm panel="db_admin" />}
                {active === 'employee' && <IdLoginForm panel="employee" />}
              </div>

              <p className="mt-10 text-xs text-slate-400">
                Authorized personnel only. All access is logged.
              </p>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
    </LoginProvider>
  );
}
