import { MasterDataUploadPanel } from '@/components/admin/MasterDataUploadPanel';

/** Same full-height XL panel as admin Master File (read-only for DB Admin). */
export default function DbAdminMasterFilePage() {
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      <MasterDataUploadPanel variant="db_admin" />
    </div>
  );
}
