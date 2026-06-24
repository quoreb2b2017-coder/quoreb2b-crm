'use client';

import { UploadRequestSpreadsheetPage } from '@/components/master-data/UploadRequestSpreadsheetPage';

export default function DbAdminUploadRequestPage({
  params,
}: {
  params: { requestId: string };
}) {
  return (
    <UploadRequestSpreadsheetPage
      requestId={params.requestId}
      backHref="/db-admin/master-data"
      backLabel="Back to My Data"
    />
  );
}
