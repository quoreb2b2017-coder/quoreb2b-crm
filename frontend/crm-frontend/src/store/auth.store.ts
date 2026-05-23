import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { clearAuthCookie, syncAuthCookie } from '@/lib/auth/cookie';
import type { LoginPanel, User } from '@/types/auth';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  sessionId: string | null;
  panel: LoginPanel | null;
  isAuthenticated: boolean;
  setAuth: (
    user: User,
    accessToken: string,
    refreshToken: string,
    panel: LoginPanel,
    sessionId?: string,
  ) => void;
  clearAuth: () => void;
  hasRole: (role: string) => boolean;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      sessionId: null,
      panel: null,
      isAuthenticated: false,
      setAuth: (user, accessToken, refreshToken, panel, sessionId) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', accessToken);
          localStorage.setItem('refreshToken', refreshToken);
          if (sessionId) localStorage.setItem('sessionId', sessionId);
        }
        const nextUser = { ...user, panel };
        set({
          user: nextUser,
          accessToken,
          refreshToken,
          sessionId: sessionId ?? null,
          panel,
          isAuthenticated: true,
        });
        syncAuthCookie({ user: nextUser, isAuthenticated: true, panel });
      },
      clearAuth: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('refreshToken');
          localStorage.removeItem('sessionId');
        }
        clearAuthCookie();
        set({
          user: null,
          accessToken: null,
          refreshToken: null,
          sessionId: null,
          panel: null,
          isAuthenticated: false,
        });
      },
      hasRole: (role) => get().user?.roles.includes(role) ?? false,
      hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,
    }),
    {
      name: 'crm-auth',
      onRehydrateStorage: () => (state) => {
        if (state?.isAuthenticated && state.user) {
          syncAuthCookie({
            user: state.user,
            isAuthenticated: true,
            panel: state.panel,
          });
        }
      },
    },
  ),
);
