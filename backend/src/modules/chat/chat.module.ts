import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ScheduleModule } from '@nestjs/schedule';
import { Conversation, ConversationSchema } from './schemas/conversation.schema';
import { ChatMessage, ChatMessageSchema } from './schemas/chat-message.schema';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatAttachmentStorageService } from './chat-attachment-storage.service';
import { ChatCleanupScheduler } from './chat-cleanup.scheduler';
import { UsersModule } from '../users/users.module';
import { EventsModule } from '../../events/events.module';

@Module({
  imports: [
    UsersModule,
    EventsModule,
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { name: Conversation.name, schema: ConversationSchema },
      { name: ChatMessage.name, schema: ChatMessageSchema },
    ]),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatAttachmentStorageService, ChatCleanupScheduler],
  exports: [ChatService],
})
export class ChatModule {}
