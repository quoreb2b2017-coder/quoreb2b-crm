'use client';

import { useAuthStore } from '@/store/auth.store';

export function useAuth() {
  const { user, isAuthenticated, hasRole, hasPermission, clearAuth } = useAuthStore();
  return { user, isAuthenticated, hasRole, hasPermission, logout: clearAuth };
}
