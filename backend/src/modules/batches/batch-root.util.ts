import { Model, Types } from 'mongoose';
import { Batch } from './schemas/batch.schema';

const MAX_DEPTH = 12;

export async function resolveRootBatchId(
  model: Model<Batch>,
  batchId: string,
): Promise<string> {
  if (!Types.ObjectId.isValid(batchId)) return batchId;
  let current = batchId;
  for (let i = 0; i < MAX_DEPTH; i++) {
    const doc = await model.findById(current).select('sourceBatchId').lean().exec();
    if (!doc?.sourceBatchId) return current;
    const parent = doc.sourceBatchId.toString();
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

/** Root batch + all descendants linked via sourceBatchId */
export async function collectBatchTree(
  model: Model<Batch>,
  rootId: string,
): Promise<Array<Record<string, unknown> & { _id: Types.ObjectId }>> {
  if (!Types.ObjectId.isValid(rootId)) return [];
  const root = await model.findById(rootId).select('-rows -headers').lean().exec();
  if (!root) return [];

  const result: Array<Record<string, unknown> & { _id: Types.ObjectId }> = [
    root as Record<string, unknown> & { _id: Types.ObjectId },
  ];
  let frontier = [rootId];

  for (let depth = 0; depth < MAX_DEPTH && frontier.length; depth++) {
    const children = await model
      .find({ sourceBatchId: { $in: frontier.map((id) => new Types.ObjectId(id)) } })
      .select('-rows -headers')
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    if (!children.length) break;
    frontier = [];
    for (const c of children) {
      const id = String(c._id);
      if (result.some((r) => String(r._id) === id)) continue;
      result.push(c as Record<string, unknown> & { _id: Types.ObjectId });
      frontier.push(id);
    }
  }

  return result;
}
