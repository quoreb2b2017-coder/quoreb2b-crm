import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true, collection: 'chat_messages' })
export class ChatMessage extends Document {
  @Prop({ required: true, index: true })
  conversationId: string;

  @Prop({ required: true, index: true })
  senderId: string;

  @Prop({ required: true, maxlength: 4000 })
  text: string;

  @Prop({ type: [String], default: [] })
  readBy: string[];
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);
ChatMessageSchema.index({ conversationId: 1, createdAt: -1 });
