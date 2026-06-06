import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export const MASTER_DATA_KEY = 'master_upload';

@Schema({ timestamps: true, collection: 'master_data' })
export class MasterDataRecord extends Document {
  @Prop({ required: true, unique: true, default: MASTER_DATA_KEY })
  key: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ required: true })
  sheetName: string;

  @Prop({ type: [String], required: true })
  headers: string[];

  @Prop({ type: [[String]], required: true, default: [] })
  rows: string[][];

  @Prop({ type: Types.ObjectId, ref: 'User' })
  uploadedBy?: Types.ObjectId;

  @Prop()
  uploadedByEmail?: string;

  /** DB admins allowed to read master data and create batches from it */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'User' }], default: [] })
  sharedWithDbAdmins: Types.ObjectId[];
}

export const MasterDataSchema = SchemaFactory.createForClass(MasterDataRecord);
MasterDataSchema.index({ sharedWithDbAdmins: 1 });
MasterDataSchema.index({ updatedAt: -1 });
