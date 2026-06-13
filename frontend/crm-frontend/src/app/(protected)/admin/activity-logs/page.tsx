import { ActivityLogsView } from '@/components/activity/ActivityLogsView';

export default function AdminActivityLogsPage() {
  return (
    <ActivityLogsView
      scope="system"
      title="System activity logs"
      subtitle="Admin — all users, filter by date or month"
    />
  );
}
