'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { useAuthStore } from '@/store/auth.store';

const navItems = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Leads', href: '/leads' },
  { label: 'Campaigns', href: '/campaigns' },
  { label: 'Reports', href: '/reports' },
  { label: 'Analytics', href: '/analytics' },
  { label: 'Billing', href: '/billing' },
];

export function ClientDashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, clearAuth } = useAuthStore();
   
  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-6 border-b">
          <h2 className="font-bold text-lg text-primary-700">Intentmatics</h2>
          <p className="text-xs text-gray-500">Client Portal</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block px-4 py-2 rounded-lg text-sm',
                pathname === item.href
                  ? 'bg-primary-50 text-primary-700 font-medium'
                  : 'text-gray-600 hover:bg-gray-50',
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t">
          <p className="text-xs text-gray-400 truncate">{user?.email}</p>
          <button
            onClick={() => {
              clearAuth();
              window.location.href = '/login';
            }}
            className="mt-2 text-sm text-red-500 hover:text-red-600"
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-gray-50">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}