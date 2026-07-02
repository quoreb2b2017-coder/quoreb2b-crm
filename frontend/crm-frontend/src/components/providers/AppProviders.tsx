'use client';

import { Toaster } from '@/components/ui/Toaster';
import { LoadingProvider } from '@/components/providers/LoadingProvider';
import { NotificationProvider } from '@/components/notifications/NotificationProvider';
import { LoginWelcomeToast } from '@/components/auth/LoginWelcomeToast';
import { MasterDataImportBanner } from '@/components/master-data/MasterDataImportBanner';
import { MasterDataImportResume } from '@/components/master-data/MasterDataImportResume';

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <LoadingProvider>
      <NotificationProvider>
        <MasterDataImportResume />
        {children}
        <MasterDataImportBanner />
        <Toaster />
        <LoginWelcomeToast />
      </NotificationProvider>
    </LoadingProvider>
  );
}
