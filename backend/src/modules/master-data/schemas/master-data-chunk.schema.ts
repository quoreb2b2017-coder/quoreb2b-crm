import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'master_data_chunks' })
export class MasterDataChunk extends Document {
  @Prop({ required: true, index: true })
  masterKey: string;

  @Prop({ required: true })
  chunkIndex: number;

  @Prop({ type: [[String]], required: true })
  rows: string[][];
}

export const MasterDataChunkSchema = SchemaFactory.createForClass(MasterDataChunk);
MasterDataChunkSchema.index({ masterKey: 1, chunkIndex: 1 }, { unique: true });
