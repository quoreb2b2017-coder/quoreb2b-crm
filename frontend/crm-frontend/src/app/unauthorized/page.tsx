import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Access denied</h1>
        <p className="text-slate-500 mb-6">You don&apos;t have permission to view this page.</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 rounded-xl bg-brand-600 text-white font-medium hover:bg-brand-700"
        >
          Back to login
        </Link>
      </div>
    </div>
  );
}
