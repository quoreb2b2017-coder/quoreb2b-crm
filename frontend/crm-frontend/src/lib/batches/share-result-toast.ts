import type { BatchShareResult } from '@/lib/api/batches.service';
import { toast } from '@/stores/toast.store';

export function toastBatchShareResult(result: BatchShareResult) {
  const { distributed, fullShareUserIds, alreadySharedUserIds = [] } = result;
  const alreadyCount = alreadySharedUserIds.length;

  if (distributed.length > 0 && fullShareUserIds.length > 0) {
    const avg = Math.round(
      distributed.reduce((s, d) => s + d.rowCount, 0) / distributed.length,
    );
    toast.success(
      'Shared successfully',
      `${distributed.length} employee(s) got equal unique slices (~${avg} leads each). ` +
        `${fullShareUserIds.length} DB admin(s) got full campaign access.` +
        (alreadyCount > 0 ? ` ${alreadyCount} already shared.` : ''),
    );
    return;
  }

  if (distributed.length > 0) {
    const avg = Math.round(
      distributed.reduce((s, d) => s + d.rowCount, 0) / distributed.length,
    );
    toast.success(
      'Equal distribution complete',
      `${distributed.length} employee(s) · ~${avg} unique leads each · no duplicate contacts` +
        (alreadyCount > 0 ? ` · ${alreadyCount} already shared` : ''),
    );
    return;
  }

  if (fullShareUserIds.length > 0) {
    toast.success(
      'Campaign shared',
      `Full campaign access granted to ${fullShareUserIds.length} recipient(s)` +
        (alreadyCount > 0 ? ` · ${alreadyCount} already shared` : ''),
    );
    return;
  }

  if (alreadyCount > 0) {
    toast.info('Already shared', `${alreadyCount} selected employee(s) already had leads assigned`);
    return;
  }

  toast.info('No changes', 'Selected users already had access');
}
