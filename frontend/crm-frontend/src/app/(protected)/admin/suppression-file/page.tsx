import { redirect } from 'next/navigation';

export default function LegacySuppressionFilePage() {
  redirect('/admin/suppression-campaigns');
}
