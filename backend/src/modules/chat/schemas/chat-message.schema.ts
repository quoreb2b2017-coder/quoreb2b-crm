import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ _id: false })
export class ChatAttachment {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  fileName: string;

  @Prop({ default: 'application/octet-stream' })
  mimeType: string;

  @Prop({ default: 0 })
  sizeBytes: number;

  /** local | s3 */
  @Prop({ default: 's3' })
  storage: string;
}

export const ChatAttachmentSchema = SchemaFactory.createForClass(ChatAttachment);

/** Temporary chat messages — auto-expire after 7 days (TTL index). */
export const CHAT_MESSAGE_TTL_SECONDS = 7 * 24 * 60 * 60;

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage extends Document {
  @Prop({ required: true, index: true })
  conversationId: string;

  @Prop({ required: true, index: true })
  senderId: string;

  @Prop({ default: '', maxlength: 4000 })
  text: string;

  @Prop({ type: [ChatAttachmentSchema], default: [] })
  attachments: ChatAttachment[];

  @Prop({ type: [String], default: [] })
  readBy: string[];
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
ChatMessageSchema.index({ conversationId: 1, createdAt: -1 });
ChatMessageSchema.index({ createdAt: 1 }, { expireAfterSeconds: CHAT_MESSAGE_TTL_SECONDS });
