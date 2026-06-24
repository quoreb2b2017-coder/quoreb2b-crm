'use client';

import { UploadRequestSpreadsheetPage } from '@/components/master-data/UploadRequestSpreadsheetPage';

export default function DbAdminEmployeeUploadDuplicatesPage({
  params,
}: {
  params: { requestId: string };
}) {
  return (
    <UploadRequestSpreadsheetPage
      requestId={params.requestId}
      backHref="/db-admin/master-data?tab=employee"
      backLabel="Back to Employee requests"
      viewMode="duplicates"
    />
  );
}
