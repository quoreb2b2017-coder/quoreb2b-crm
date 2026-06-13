'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { useLoginCore } from '@/lib/auth/use-login';
import { LoginLoadingOverlay } from '@/components/auth/LoginLoadingOverlay';

type LoginContextValue = ReturnType<typeof useLoginCore>;

const LoginContext = createContext<LoginContextValue | null>(null);

export function LoginProvider({ children }: { children: ReactNode }) {
  const login = useLoginCore();

  return (
    <LoginContext.Provider value={login}>
      {children}
      <LoginLoadingOverlay visible={login.loading} />
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
