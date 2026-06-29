import dynamic from 'next/dynamic';

const DbAdminBulkEmailVerificationPanel = dynamic(
  () =>
    import('@/components/db-admin/DbAdminBulkEmailVerificationPanel').then((m) => ({
      default: m.DbAdminBulkEmailVerificationPanel,
    })),
  {
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Loading email verification…
      </div>
    ),
  },
);

export default function DbAdminBulkEmailVerificationPage() {
  return <DbAdminBulkEmailVerificationPanel />;
}
