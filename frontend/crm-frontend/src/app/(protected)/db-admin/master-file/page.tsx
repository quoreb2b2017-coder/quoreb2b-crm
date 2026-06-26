import { MasterDatabaseExplorer } from '@/components/master-database/MasterDatabaseExplorer';

/** Filter-based master database (Compare Bazaar UI). Data visible only after search. */
export default function DbAdminMasterFilePage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <MasterDatabaseExplorer variant="db_admin" />
    </div>
  );
}
