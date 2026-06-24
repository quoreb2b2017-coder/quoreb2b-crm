'use client';

import { UploadRequestSpreadsheetPage } from '@/components/master-data/UploadRequestSpreadsheetPage';

export default function AdminUploadRequestDuplicatesPage({
  params,
}: {
  params: { requestId: string };
}) {
  return (
    <UploadRequestSpreadsheetPage
      requestId={params.requestId}
      backHref="/admin/master-data-upload/requests"
      backLabel="Back to upload requests"
      viewMode="duplicates"
    />
  );
}
