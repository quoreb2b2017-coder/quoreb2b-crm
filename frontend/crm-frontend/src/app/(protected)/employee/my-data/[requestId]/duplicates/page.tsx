'use client';

import { UploadRequestSpreadsheetPage } from '@/components/master-data/UploadRequestSpreadsheetPage';

export default function EmployeeUploadDuplicatesPage({
  params,
}: {
  params: { requestId: string };
}) {
  return (
    <UploadRequestSpreadsheetPage
      requestId={params.requestId}
      backHref="/employee/my-data"
      backLabel="Back to My Data"
      viewMode="duplicates"
    />
  );
}
