'use client';

import { LeaveApprovalsPanel } from '@/components/attendance/LeaveApprovalsPanel';

export function DbAdminLeaveApplyPanel() {
  return (
    <LeaveApprovalsPanel
      variant="db_admin"
      title="Leave Apply & Approvals"
      subtitle="Review team requests or apply your own leave from the side panel"
    />
  );
}
