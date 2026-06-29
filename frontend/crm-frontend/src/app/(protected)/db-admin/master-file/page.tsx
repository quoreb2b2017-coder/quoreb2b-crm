import dynamic from 'next/dynamic';

const MasterDatabaseExplorer = dynamic(
  () =>
    import('@/components/master-database/MasterDatabaseExplorer').then((m) => ({
      default: m.MasterDatabaseExplorer,
    })),
  {
    loading: () => (
      <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
        Loading master database…
      </div>
    ),
  },
);

/** Filter-based master database (Compare Bazaar UI). Data visible only after search. */
export default function DbAdminMasterFilePage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <MasterDatabaseExplorer variant="db_admin" />
    </div>
  );
}
