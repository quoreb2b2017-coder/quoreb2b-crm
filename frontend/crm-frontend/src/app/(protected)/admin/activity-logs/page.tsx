import { ActivityLogsView } from '@/components/activity/ActivityLogsView';

export default function AdminActivityLogsPage() {
  return (
    <ActivityLogsView
      scope="system"
      title="System activity logs"
      subtitle="Super Admin — all users, filter by date or month"
    />
  );
}
