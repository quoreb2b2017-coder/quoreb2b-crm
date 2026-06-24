'use client';

import { UploadRequestSpreadsheetPage } from '@/components/master-data/UploadRequestSpreadsheetPage';

export default function AdminUploadRequestPage({
  params,
}: {
  params: { requestId: string };
}) {
  return (
    <UploadRequestSpreadsheetPage
      requestId={params.requestId}
      backHref="/admin/master-data-upload/requests"
      backLabel="Back to upload requests"
    />
  );
}
