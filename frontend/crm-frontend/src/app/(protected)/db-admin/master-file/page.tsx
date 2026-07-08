'use client';

import { MasterDatabaseExplorer } from '@/components/master-database/MasterDatabaseExplorer';

/** Filter-based master database — same fast bootstrap load as Super Admin embedded view. */
export default function DbAdminMasterFilePage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <MasterDatabaseExplorer variant="db_admin" />
    </div>
  );
}
