'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useLoginCore } from '@/lib/auth/use-login';
import { LoginLoadingOverlay } from '@/components/auth/LoginLoadingOverlay';
import { LoginAccessDeniedModal } from '@/components/auth/LoginAccessDeniedModal';

type LoginContextValue = ReturnType<typeof useLoginCore>;

const LoginContext = createContext<LoginContextValue | null>(null);

export function LoginProvider({ children }: { children: ReactNode }) {
  const login = useLoginCore();

  return (
    <LoginContext.Provider value={login}>
      {children}
      <LoginLoadingOverlay visible={login.loading} />
      <LoginAccessDeniedModal open={login.ipDenied} onClose={login.clearIpDenied} />
    </LoginContext.Provider>
  );
}

export function useLogin() {
  const ctx = useContext(LoginContext);
  if (!ctx) {
    throw new Error('useLogin must be used within LoginProvider');
  }
  return ctx;
}
