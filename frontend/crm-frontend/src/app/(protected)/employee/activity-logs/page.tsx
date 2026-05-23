import { ActivityLogsView } from '@/components/activity/ActivityLogsView';

export default function EmployeeActivityLogsPage() {
  return (
    <ActivityLogsView
      scope="self"
      title="My activity logs"
      subtitle="Employee — your work history only"
    />
  );
}
