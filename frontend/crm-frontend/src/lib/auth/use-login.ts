'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  getDashboardPath,
  loginWithEmail,
  loginWithEmployeeId,
  loginWithOtp,
  requestAdminOtp,
} from '@/lib/auth/login';
import { connectSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';
import { useAdminProductStore } from '@/store/admin-product.store';
import type { AuthTokens, LoginPanel } from '@/types/auth';
import { extractApiError } from '@/lib/api/errors';
import { markFreshLogin } from '@/lib/auth/sleep-logout';
import { stashLoginPunch } from '@/lib/auth/login-punch';
import { stashLoginWelcome } from '@/lib/auth/login-welcome';
import { isLoginIpDeniedError } from '@/lib/auth/login-errors';
import { getApiBaseUrl } from '@/lib/constants/api-url';

function formatLoginError(e: unknown): string {
  const err = e as { code?: string; message?: string };
  if (
    err.code === 'ERR_NETWORK' ||
    err.code === 'ECONNREFUSED' ||
    err.message?.includes('Network Error') ||
    err.message?.includes('ECONNREFUSED')
  ) {
    const apiUrl = getApiBaseUrl();
    if (typeof window !== 'undefined' && !apiUrl.includes('localhost')) {
      return `Cannot reach the API (${window.location.origin}${apiUrl}). Try hard refresh (Ctrl+Shift+R) or wait for Vercel redeploy.`;
    }
    return 'API is not running. Open a terminal: cd backend → npm run start:dev (wait for "API running on port 4000")';
  }
  if (err.code === 'ECONNABORTED' || /timeout.*exceeded/i.test(err.message ?? '')) {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
    if (apiUrl && !apiUrl.includes('localhost')) {
      return 'Server is not responding — a large file import may have overloaded it. Wait 2–3 minutes or reboot EC2 from AWS Console, then try login again.';
    }
    return 'Server is taking too long to respond. If a large file upload is running, wait a minute and try again.';
  }
  return extractApiError(e, 'Login failed');
}

export function useLoginCore() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ipDenied, setIpDenied] = useState(false);

  const handleLoginFailure = (e: unknown) => {
    if (isLoginIpDeniedError(e)) {
      setIpDenied(true);
      setError('');
    } else {
      setError(formatLoginError(e));
    }
    setLoading(false);
  };

  const clearIpDenied = () => setIpDenied(false);

  const beginLoginAttempt = () => {
    setLoading(true);
    setError('');
    setIpDenied(false);
  };

  const completeLogin = (tokens: AuthTokens, panel: LoginPanel) => {
    markFreshLogin();
    setAuth(tokens.user, tokens.accessToken, tokens.refreshToken, panel, tokens.sessionId);
    if (panel === 'admin') {
      useAdminProductStore.getState().openPickerAfterLogin();
    }
    if (!tokens.accessToken.startsWith('demo-')) {
      connectSocket(tokens.accessToken);
    }
    if (typeof window !== 'undefined') {
      const name = tokens.user.firstName ?? tokens.user.email?.split('@')[0] ?? 'there';
      stashLoginWelcome({ name, panel });

      if (tokens.attendancePunch?.punchedIn && !tokens.attendancePunch?.dayClosed) {
        const punch = {
          ...tokens.attendancePunch,
          sessionId: tokens.sessionId,
          workTimeTodayGrossMinutes: tokens.workTimeTodayGrossMinutes,
        };
        stashLoginPunch(punch);
        window.dispatchEvent(new CustomEvent('attendance:login-punch', { detail: punch }));
      }
      window.dispatchEvent(new CustomEvent('attendance:refresh'));
      window.dispatchEvent(new CustomEvent('work-time:refresh'));
      window.dispatchEvent(new CustomEvent('break-punch:refresh'));
    }
    router.replace(getDashboardPath(panel));
  };

  const loginAdminPassword = async (email: string, password: string) => {
    beginLoginAttempt();
    try {
      const tokens = await loginWithEmail(email, password);
      const roles = tokens.user.roles ?? [];
      if (!roles.includes('admin') && !roles.includes('super_admin')) {
        throw new Error('This account is not an admin');
      }
      completeLogin(tokens, 'admin');
    } catch (e: unknown) {
      handleLoginFailure(e);
    }
  };

  const loginAdminOtpRequest = async (
    email: string,
  ): Promise<{ ok: boolean }> => {
    beginLoginAttempt();
    try {
      await requestAdminOtp(email);
      setLoading(false);
      return { ok: true };
    } catch (e: unknown) {
      handleLoginFailure(e);
      return { ok: false };
    }
  };

  const loginAdminOtpVerify = async (email: string, otp: string) => {
    beginLoginAttempt();
    try {
      const tokens = await loginWithOtp(email, otp);
      completeLogin(tokens, 'admin');
    } catch (e: unknown) {
      handleLoginFailure(e);
    }
  };

  const loginWithId = async (
    employeeId: string,
    password: string,
    panel: 'db_admin' | 'employee',
  ) => {
    beginLoginAttempt();
    try {
      const tokens = await loginWithEmployeeId(employeeId, password);
      const roles = tokens.user.roles ?? [];
      if (panel === 'db_admin' && !roles.includes('db_admin')) {
        throw new Error('Not a database administrator account');
      }
      if (panel === 'employee' && !roles.includes('employee')) {
        throw new Error('Not an employee account');
      }
      completeLogin(tokens, panel);
    } catch (e: unknown) {
      handleLoginFailure(e);
    }
  };

  return {
    loading,
    error,
    setError,
    ipDenied,
    clearIpDenied,
    loginAdminPassword,
    loginAdminOtpRequest,
    loginAdminOtpVerify,
    loginWithId,
  };
}

/** @deprecated Use useLogin from LoginProvider */
export function useLogin() {
  return useLoginCore();
}
