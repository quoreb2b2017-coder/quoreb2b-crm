import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { ChatMessage, CHAT_MESSAGE_TTL_SECONDS } from './schemas/chat-message.schema';
import { Conversation } from './schemas/conversation.schema';
import { ChatAttachmentStorageService } from './chat-attachment-storage.service';

/**
 * Chat is temporary: purge messages older than 7 days (attachments + empty threads).
 * Mongo TTL also expires message docs; this cron cleans S3/local files and stale conversations.
 */
@Injectable()
export class ChatCleanupScheduler {
  private readonly logger = new Logger(ChatCleanupScheduler.name);

  constructor(
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    @InjectModel(Conversation.name) private readonly conversations: Model<Conversation>,
    private readonly storage: ChatAttachmentStorageService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async purgeExpiredChat(): Promise<void> {
    const cutoff = new Date(Date.now() - CHAT_MESSAGE_TTL_SECONDS * 1000);
    try {
      const stale = await this.messages
        .find({ createdAt: { $lt: cutoff } })
        .select('attachments')
        .lean()
        .limit(2000)
        .exec();

      for (const msg of stale) {
        for (const att of (msg.attachments as Array<{ key: string; storage?: string }>) ?? []) {
          if (att?.key) {
            await this.storage.deleteObject(att.key, att.storage || 's3');
          }
        }
      }

      const deleted = await this.messages.deleteMany({ createdAt: { $lt: cutoff } }).exec();

      // Conversations with no recent activity and no remaining messages
      const idle = await this.conversations
        .find({
          $or: [
            { lastMessageAt: { $lt: cutoff } },
            { lastMessageAt: null, updatedAt: { $lt: cutoff } },
          ],
        })
        .select('_id')
        .limit(500)
        .lean()
        .exec();

      let removedConvos = 0;
      for (const c of idle) {
        const id = String(c._id);
        const remaining = await this.messages.countDocuments({ conversationId: id }).exec();
        if (remaining === 0) {
          await this.conversations.deleteOne({ _id: c._id }).exec();
          removedConvos += 1;
        } else {
          // Refresh preview from newest remaining message
          const last = await this.messages
            .findOne({ conversationId: id })
            .sort({ createdAt: -1 })
            .lean()
            .exec();
          if (last) {
            const text =
              (last.text as string) ||
              ((last.attachments as unknown[])?.length
                ? `📎 ${(last.attachments as Array<{ fileName: string }>)[0]?.fileName || 'file'}`
                : '');
            await this.conversations.updateOne(
              { _id: c._id },
              {
                $set: {
                  lastMessageText: text,
                  lastMessageAt: (last as { createdAt?: Date }).createdAt,
                  lastMessageSenderId: last.senderId,
                },
              },
            );
          }
        }
      }

      if (deleted.deletedCount || removedConvos) {
        this.logger.log(
          `Chat cleanup: removed ${deleted.deletedCount ?? 0} messages, ${removedConvos} conversations (older than 7 days)`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Chat cleanup failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
}
