import '@/components/dashboard/dashboard.css';

interface StatCardProps {
  label: string;
  value: string | number;
  trend?: string;
}

export function StatCard({ label, value, trend }: StatCardProps) {
  return (
    <div className="dash-card group p-6 transition-all duration-200 ease-smooth hover:-translate-y-0.5 hover:shadow-soft-lg">
      <p className="text-xs font-bold uppercase tracking-wide text-slate-400 transition-colors duration-150 group-hover:text-slate-500">{label}</p>
      <p className="dash-kpi-value transition-transform duration-200 group-hover:scale-[1.02]">{value}</p>
      {trend && (
        <p className="mt-2 inline-flex rounded-full bg-[#e8f1fb] px-2 py-0.5 text-xs font-semibold text-[#2e7ad1] ring-1 ring-[#2e7ad1]/15">
          {trend}
        </p>
      )}
    </div>
  );
}
