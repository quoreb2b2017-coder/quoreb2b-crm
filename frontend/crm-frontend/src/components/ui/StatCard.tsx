import '@/components/dashboard/dashboard.css';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
}

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div className="dash-card group p-6 transition-transform duration-300 hover:-translate-y-0.5">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="dash-kpi-value">{value}</p>
      {trend && (
        <p className="mt-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
          {trend}
        </p>
      )}
    </div>
  );
}
