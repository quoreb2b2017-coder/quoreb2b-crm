import type { BatchRecord } from '@/lib/api/batches.service';
import {
  createEmptyMonthMap,
  resolveBatchPeriod,
} from '@/lib/batches/month-structure';

export type CampaignFolder =
  | { kind: 'campaign'; batch: BatchRecord; children: BatchRecord[] }
  | { kind: 'orphan-group'; parentId: string; parentName: string; children: BatchRecord[] };

function sortByNewest(a: BatchRecord, b: BatchRecord) {
  const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
  const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
  return tb - ta;
}

/** Auto-generated on share(); kept in DB but hidden in campaign list UI. */
const SHARE_SLICE_DESCRIPTION_RE = /^Equal unique share from .+ \(\d+ leads?\)$/;

export function isShareSliceDescription(description?: string | null): boolean {
  return Boolean(description && SHARE_SLICE_DESCRIPTION_RE.test(description));
}

/** Display name for a share slice row (assignee after " — "). */
export function sliceAssigneeName(batch: BatchRecord): string {
  const dash = batch.name.indexOf(' — ');
  if (dash > 0) return batch.name.slice(dash + 3);
  return batch.name;
}

function parentNameFromChild(child: BatchRecord): string {
  const fromDesc = child.description?.match(/Equal unique share from (.+?) \(\d+ leads?\)/)?.[1];
  if (fromDesc) return fromDesc;
  const dash = child.name.indexOf(' — ');
  if (dash > 0) return child.name.slice(0, dash);
  return child.name;
}

function folderAnchor(folder: CampaignFolder): BatchRecord {
  return folder.kind === 'campaign' ? folder.batch : folder.children[0];
}

function folderKey(folder: CampaignFolder): string {
  return folder.kind === 'campaign' ? folder.batch.id : `orphan:${folder.parentId}`;
}

/** Nest share slices (sourceBatchId) under their parent campaign folder. */
export function buildCampaignFolders(batches: BatchRecord[]): CampaignFolder[] {
  const byId = new Map(batches.map((b) => [b.id, b]));
  const childrenByParent = new Map<string, BatchRecord[]>();

  for (const b of batches) {
    if (!b.sourceBatchId) continue;
    const list = childrenByParent.get(b.sourceBatchId) ?? [];
    list.push(b);
    childrenByParent.set(b.sourceBatchId, list);
  }

  const assignedChildIds = new Set<string>();
  const folders: CampaignFolder[] = [];

  for (const b of batches) {
    if (b.sourceBatchId) continue;
    const children = [...(childrenByParent.get(b.id) ?? [])].sort(sortByNewest);
    children.forEach((c) => assignedChildIds.add(c.id));
    folders.push({ kind: 'campaign', batch: b, children });
  }

  const orphanGroups = new Map<string, BatchRecord[]>();
  for (const b of batches) {
    if (!b.sourceBatchId || assignedChildIds.has(b.id)) continue;
    if (byId.has(b.sourceBatchId)) continue;
    const list = orphanGroups.get(b.sourceBatchId) ?? [];
    list.push(b);
    orphanGroups.set(b.sourceBatchId, list);
  }

  for (const [parentId, children] of orphanGroups) {
    const sorted = [...children].sort(sortByNewest);
    sorted.forEach((c) => assignedChildIds.add(c.id));
    folders.push({
      kind: 'orphan-group',
      parentId,
      parentName: parentNameFromChild(sorted[0]),
      children: sorted,
    });
  }

  folders.sort((a, b) => sortByNewest(folderAnchor(a), folderAnchor(b)));
  return folders;
}

export function groupCampaignFoldersByMonth(
  folders: CampaignFolder[],
  year: number,
): Map<number, CampaignFolder[]> {
  const map = createEmptyMonthMap<CampaignFolder>();
  for (const folder of folders) {
    const anchor = folderAnchor(folder);
    if (!anchor) continue;
    const { month, year: y } = resolveBatchPeriod(anchor);
    if (y !== year) continue;
    map.get(month)!.push(folder);
  }
  map.forEach((list) => {
    list.sort((a, b) => sortByNewest(folderAnchor(a), folderAnchor(b)));
  });
  return map;
}

export function countCampaignFoldersInYear(
  folders: CampaignFolder[],
  year: number,
): number {
  let n = 0;
  for (const folder of folders) {
    const { year: y } = resolveBatchPeriod(folderAnchor(folder));
    if (y === year) n += 1;
  }
  return n;
}

export { folderKey };
