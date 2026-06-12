import { redirect } from 'next/navigation';

export default function DbAdminEmployeeDataPage() {
  redirect('/db-admin/master-data?tab=employee');
}
