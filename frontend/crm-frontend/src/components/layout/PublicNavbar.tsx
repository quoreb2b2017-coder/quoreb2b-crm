import Link from 'next/link';
import { LogIn, LayoutDashboard } from 'lucide-react';

export function PublicNavbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <LayoutDashboard className="h-5 w-5 text-slate-900" strokeWidth={2} />
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            QuoreB2B <span className="font-normal text-slate-500">CRM</span>
          </span>
        </Link>

        <a
          href="#sign-in"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 transition-colors hover:text-brand-600"
        >
          <LogIn className="h-4 w-4" />
          Sign in
        </a>
      </div>
    </header>
  );
}
