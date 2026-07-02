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
import './public-hub.css';

const tabs: { id: LoginPanel; label: string; icon: typeof Shield }[] = [
  { id: 'admin', label: 'Super Admin', icon: Shield },
  { id: 'db_admin', label: 'DB Admin', icon: Database },
  { id: 'employee', label: 'Employee', icon: Users },
];

const features = [
  { icon: BarChart3, title: 'Role-based dashboards', desc: 'KPIs tailored to every team.' },
  { icon: Bell, title: 'Real-time alerts', desc: 'Live updates on leads and campaigns.' },
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
      <div className="public-hub">
        <PublicNavbar />

        {(logoutReason === 'idle' || logoutReason === 'sleep') && (
          <div className="public-hub__alert">
            {logoutReason === 'sleep'
              ? 'You were signed out because your PC slept or the screen was locked. Please sign in again.'
              : `You were signed out after ${IDLE_TIMEOUT_MINUTES} minutes of inactivity. Please sign in again.`}
          </div>
        )}

        <div className="public-hub__body">
          <aside className="public-hub__brand" aria-label="QuoreB2B">
            <div className="public-hub__brand-glow public-hub__brand-glow--a" />
            <div className="public-hub__brand-glow public-hub__brand-glow--b" />

            <div className="public-hub__brand-copy">
              <h1>Your organization&apos;s secure CRM gateway</h1>
              <p>
                Master data, campaigns, attendance, and analytics — one platform for your entire
                team.
              </p>

              <ul className="public-hub__points">
                {features.map((f) => {
                  const Icon = f.icon;
                  return (
                    <li key={f.title} className="public-hub__point">
                      <span className="public-hub__point-icon">
                        <Icon className="h-4 w-4" strokeWidth={2} />
                      </span>
                      <div>
                        <p className="public-hub__point-title">{f.title}</p>
                        <p className="public-hub__point-desc">{f.desc}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </aside>

          <main className="public-hub__signin" id="sign-in">
            <div className="public-hub__signin-inner">
              <h2 className="public-hub__signin-title">Sign in</h2>
              <p className="public-hub__signin-sub">Choose your role and enter credentials</p>

              <nav className="public-hub__roles" aria-label="Sign in role">
                {tabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = active === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActive(tab.id)}
                      className={cn(
                        'public-hub__role',
                        isActive ? 'public-hub__role--active' : 'public-hub__role--idle',
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
                      {tab.label}
                    </button>
                  );
                })}
              </nav>

              <div className="public-hub__form animate-slide-up" key={active}>
                {active === 'admin' && <AdminLoginForm />}
                {active === 'db_admin' && <IdLoginForm panel="db_admin" />}
                {active === 'employee' && <IdLoginForm panel="employee" />}
              </div>

              <p className="public-hub__fineprint">
                Authorized personnel only. All access is logged and monitored.
              </p>
            </div>
          </main>
        </div>

        <PublicFooter />
      </div>
    </LoginProvider>
  );
}
