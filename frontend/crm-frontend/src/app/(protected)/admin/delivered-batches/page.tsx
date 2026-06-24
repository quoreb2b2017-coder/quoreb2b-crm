import { redirect } from 'next/navigation';

export default function LegacyDeliveredBatchesPage() {
  redirect('/admin/suppression-batches');
}
