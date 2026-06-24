'use client';

import { UploadRequestSpreadsheetPage } from '@/components/master-data/UploadRequestSpreadsheetPage';

export default function AdminEmployeeUploadRequestPage({
  params,
}: {
  params: { requestId: string };
}) {
  return (
    <UploadRequestSpreadsheetPage
      requestId={params.requestId}
      backHref="/admin/employee-data"
      backLabel="Back to Employee data"
    />
  );
}
