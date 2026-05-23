export default function ClientDashboardPage() {
  const stats = [
    { label: 'Total Leads', value: '—' },
    { label: 'Active Campaigns', value: '—' },
    { label: 'Conversion Rate', value: '—' },
    { label: 'Revenue', value: '—' },
  ];

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl shadow p-6 border">
            <p className="text-sm text-gray-500">{s.label}</p>
            <p className="text-3xl font-bold mt-2">{s.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
