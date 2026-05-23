import { ClientDashboardLayout } from '@/components/layout/ClientDashboardLayout';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return <ClientDashboardLayout>{children}</ClientDashboardLayout>;
}
