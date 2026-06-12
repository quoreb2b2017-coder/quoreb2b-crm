import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PersonalNoteDocument = PersonalNote & Document;

export enum NotePriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

@Schema({ timestamps: true, collection: 'personal_notes' })
export class PersonalNote {
  @Prop({ type: String, required: true, trim: true, maxlength: 200 })
  title: string;

  @Prop({ type: String, default: '' })
  content: string;

  @Prop({ type: [String], default: [] })
  tags: string[];

  @Prop({ type: String, enum: NotePriority, default: NotePriority.MEDIUM })
  priority: NotePriority;

  @Prop({ type: Boolean, default: false })
  isPinned: boolean;

  @Prop({ type: Boolean, default: false })
  isArchived: boolean;

  @Prop({ type: Date, default: null })
  reminderDate?: Date | null;

  @Prop({ type: String, default: null })
  attachmentUrl?: string | null;

  @Prop({ type: String, default: null })
  attachmentName?: string | null;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  createdBy: Types.ObjectId;
}

export const PersonalNoteSchema = SchemaFactory.createForClass(PersonalNote);

PersonalNoteSchema.index({ createdBy: 1, isArchived: 1, isPinned: -1, updatedAt: -1 });
PersonalNoteSchema.index({ createdBy: 1, priority: 1 });
PersonalNoteSchema.index({ createdBy: 1, tags: 1 });
PersonalNoteSchema.index({ title: 'text', content: 'text', tags: 'text' });
