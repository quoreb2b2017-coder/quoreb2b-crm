import { AdminEmployeeDataPanel } from '@/components/admin/AdminEmployeeDataPanel';

export default function AdminEmployeeDataPage() {
  return (
    <div className="flex h-full min-h-0 flex-col bg-[#f4f6f9]">
      <AdminEmployeeDataPanel mode="uploads" />
    </div>
  );
}
