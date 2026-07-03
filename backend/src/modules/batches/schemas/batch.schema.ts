import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ timestamps: true })
export class Batch extends Document {
  @Prop({ required: true })
  name: string;

  @Prop()
  description?: string;

  @Prop({ type: [String], required: true })
  headers: string[];

  @Prop({ type: [[String]], required: true, default: [] })
  rows: string[][];

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  createdByEmail?: string;

  @Prop()
  createdByName?: string;

  // users this batch is shared with
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWith: Types.ObjectId[];

  @Prop({ default: 'active' })
  status: string;

  @Prop({ default: 0 })
  rowCount: number;

  @Prop({ default: 0 })
  columnCount: number;

  @Prop()
  sourceFileName?: string;

  /** Parent batch when DB admin creates a filtered sub-batch */
  @Prop({ type: Types.ObjectId, ref: 'Batch' })
  sourceBatchId?: Types.ObjectId;

  /** 1–12 (January = 1); set automatically from creation date */
  @Prop({ min: 1, max: 12 })
  batchMonth?: number;

  @Prop()
  batchYear?: number;

  /** Master sheet row indices (0-based) when batch was created from master data upload */
  @Prop({ type: [Number], default: [] })
  masterSourceRowIndices?: number[];

  /** Suppression file row indices (0-based) when batch was created from suppression data */
  @Prop({ type: [Number], default: [] })
  suppressionSourceRowIndices?: number[];

  /** @deprecated use suppressionSourceRowIndices — legacy delivered batches */
  @Prop({ type: [Number], default: [] })
  deliveredSourceRowIndices?: number[];

  /** Parent batch row indices when this batch is an equal-share slice from sourceBatchId */
  @Prop({ type: [Number], default: [] })
  parentSourceRowIndices?: number[];

  /** VOIP / GPS / Email / custom channel label */
  @Prop()
  campaignChannel?: string;

  /** standard campaign vs admin-merged ready QC output */
  @Prop({ default: 'standard' })
  batchKind?: string;
}

export const BatchSchema = SchemaFactory.createForClass(Batch);
BatchSchema.index({ createdBy: 1, createdAt: -1 });
BatchSchema.index({ createdBy: 1, updatedAt: -1 });
BatchSchema.index({ sharedWith: 1 });
BatchSchema.index({ sharedWith: 1, updatedAt: -1 });
BatchSchema.index({ batchYear: -1, batchMonth: -1 });
BatchSchema.index({ sourceBatchId: 1 });
BatchSchema.index({ batchKind: 1, batchYear: -1, batchMonth: -1 });
BatchSchema.index({ batchKind: 1, sourceBatchId: 1 });
BatchSchema.index({ batchKind: 1, campaignChannel: 1 });
BatchSchema.index({ createdBy: 1, batchYear: -1, batchMonth: -1 });
// M10: list/sort paths used by loadAllBatches, QC, suppression campaigns
BatchSchema.index({ batchKind: 1, updatedAt: -1 });
BatchSchema.index({ batchKind: 1, rowCount: -1, updatedAt: -1 });
BatchSchema.index({ createdBy: 1, batchKind: 1, batchYear: -1, batchMonth: -1, createdAt: -1 });
BatchSchema.index({ sharedWith: 1, batchKind: 1, batchYear: -1, batchMonth: -1, createdAt: -1 });
BatchSchema.index({ batchKind: 1, batchYear: -1, batchMonth: -1, createdAt: -1 });
BatchSchema.index({ batchKind: 1, name: 1, campaignChannel: 1, batchYear: 1, batchMonth: 1 });
BatchSchema.index({ sourceBatchId: 1, batchKind: 1 });
BatchSchema.index(
  { batchKind: 1, batchYear: -1, batchMonth: -1 },
  { partialFilterExpression: { sourceBatchId: null } },
);
