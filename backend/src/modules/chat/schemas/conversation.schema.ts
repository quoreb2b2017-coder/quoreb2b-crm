import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'chat_conversations' })
export class Conversation extends Document {
  /** Sorted pair key: `${minId}:${maxId}` — unique direct chat */
  @Prop({ required: true, unique: true, index: true })
  pairKey: string;

  @Prop({ type: [String], required: true, index: true })
  participantIds: string[];

  @Prop({ default: '' })
  lastMessageText: string;

  @Prop()
  lastMessageAt?: Date;

  @Prop()
  lastMessageSenderId?: string;

  /** unread count keyed by userId */
  @Prop({ type: Object, default: {} })
  unreadCounts: Record<string, number>;
}

export const ConversationSchema = SchemaFactory.createForClass(Conversation);
ConversationSchema.index({ participantIds: 1, lastMessageAt: -1 });
ConversationSchema.index({ lastMessageAt: -1 });
