import { StatCard } from '@/components/ui/StatCard';

interface Stat {
  label: string;
  value: string;
  trend?: string;
}

interface DashboardStatsProps {
  stats: Stat[];
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6">
      {stats.map((stat, i) => (
        <div key={stat.label} className="animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
          <StatCard label={stat.label} value={stat.value} trend={stat.trend} />
        </div>
      ))}
    </div>
  );
}
