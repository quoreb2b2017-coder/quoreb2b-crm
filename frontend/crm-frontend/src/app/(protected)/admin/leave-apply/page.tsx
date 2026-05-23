import { LeaveApprovalsPanel } from '@/components/attendance/LeaveApprovalsPanel';

export default function SuperAdminLeaveApplyPage() {
  return (
    <LeaveApprovalsPanel
      variant="admin"
      title="Leave Requests"
      subtitle="All employee and team leave applications — approve or reject from here"
    />
  );
}
