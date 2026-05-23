export default function BillingPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Billing</h1>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow border p-6">
          <h2 className="font-semibold mb-4">Current Plan</h2>
          <p className="text-gray-500 text-sm">Billing integration placeholder.</p>
        </div>
        <div className="bg-white rounded-xl shadow border p-6">
          <h2 className="font-semibold mb-4">Invoice History</h2>
          <p className="text-gray-500 text-sm">No invoices yet.</p>
        </div>
      </div>
    </div>
  );
}
