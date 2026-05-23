import { ActivityLogsView } from '@/components/activity/ActivityLogsView';

export default function DbAdminActivityLogsPage() {
  return (
    <ActivityLogsView
      scope="self"
      title="My activity logs"
      subtitle="Database Administrator — your sessions and actions only"
    />
  );
}
