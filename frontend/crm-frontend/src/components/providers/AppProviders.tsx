'use client';

import { Toaster } from '@/components/ui/Toaster';
import { LoadingProvider } from '@/components/providers/LoadingProvider';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { LoginWelcomeToast } from '@/components/auth/LoginWelcomeToast';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LoadingProvider>
      <NotificationProvider>
        {children}
        <Toaster />
        <LoginWelcomeToast />
      </NotificationProvider>
    </LoadingProvider>
  );
}
