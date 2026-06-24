import { redirect } from 'next/navigation';

export default function LegacySuppressionBatchesPage() {
  redirect('/admin/suppression-campaigns');
}
