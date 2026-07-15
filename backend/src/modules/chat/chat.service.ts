import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { ChatMessage, ChatAttachment } from './schemas/chat-message.schema';
import { UsersService } from '../users/users.service';
import { EventsGateway } from '../../events/events.gateway';
import { SystemRole } from '../../common/constants/roles.constant';
import { ChatAttachmentStorageService } from './chat-attachment-storage.service';
import type { ChatAttachmentMetaDto } from './dto/chat.dto';

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

function isOversight(roles: string[] = []): boolean {
  return roles.includes(SystemRole.ADMIN) || roles.includes(SystemRole.SUPER_ADMIN);
}

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name) private readonly conversations: Model<Conversation>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    private readonly usersService: UsersService,
    private readonly events: EventsGateway,
    private readonly storage: ChatAttachmentStorageService,
  ) {}

  /** All active CRM users appear automatically as chat contacts (by name). */
  async listContacts(callerId: string) {
    const users = await this.usersService.findActiveChatContacts(500);
    return {
      data: users
        .filter((u) => u.id !== callerId)
        .map((u) => ({
          id: u.id,
          firstName: u.firstName,
          lastName: u.lastName,
          email: u.email,
          employeeId: u.employeeId,
          roles: u.roles,
          displayName: `${u.firstName} ${u.lastName}`.trim(),
        })),
    };
  }

  async listConversations(
    userId: string,
    roles: string[] = [],
    mode: 'mine' | 'oversight' = 'mine',
  ) {
    const canOversee = isOversight(roles);
    const oversight = mode === 'oversight' && canOversee;
    if (mode === 'oversight' && !canOversee) {
      throw new ForbiddenException('Admin oversight only');
    }
    const rows = await this.conversations
      .find(oversight ? {} : { participantIds: userId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(oversight ? 400 : 200)
      .lean()
      .exec();

    const allParticipantIds = [
      ...new Set(rows.flatMap((c) => (c.participantIds as string[]) ?? [])),
    ];
    const peers = await this.usersService.findUsersByIds(allParticipantIds);
    const peerMap = new Map(peers.map((p) => [p.id, p]));

    return {
      data: rows.map((c) => {
        const participantIds = (c.participantIds as string[]) ?? [];
        const isObserver = oversight && !participantIds.includes(userId);
        const peerId =
          participantIds.find((id) => id !== userId) ??
          participantIds[0] ??
          '';
        const otherIds = isObserver
          ? participantIds
          : participantIds.filter((id) => id !== userId);
        const participants = otherIds.map((id) => {
          const p = peerMap.get(id);
          return {
            id,
            name: p ? `${p.firstName} ${p.lastName}`.trim() : 'Unknown',
            email: p?.email ?? '',
            roles: p?.roles ?? [],
          };
        });
        const peer = peerMap.get(peerId);
        const title = isObserver
          ? participants.map((p) => p.name).join(' ↔ ') || 'Conversation'
          : peer
            ? `${peer.firstName} ${peer.lastName}`.trim()
            : 'Unknown user';

        return {
          id: String(c._id),
          peerId: isObserver ? '' : peerId,
          peerName: title,
          peerEmail: isObserver ? '' : peer?.email ?? '',
          peerRoles: isObserver ? [] : peer?.roles ?? [],
          participantIds,
          participants,
          isObserver,
          lastMessageText: c.lastMessageText ?? '',
          lastMessageAt: c.lastMessageAt ?? null,
          lastMessageSenderId: c.lastMessageSenderId ?? null,
          unread: isObserver
            ? 0
            : Number((c.unreadCounts as Record<string, number>)?.[userId] ?? 0),
        };
      }),
      oversight,
      retentionDays: 7,
    };
  }

  async startOrGet(userId: string, peerUserId: string) {
    if (!Types.ObjectId.isValid(peerUserId)) {
      throw new BadRequestException('Invalid user');
    }
    if (userId === peerUserId) {
      throw new BadRequestException('Cannot chat with yourself');
    }

    const peer = await this.usersService.findByIdSafe(peerUserId);
    if (!peer || peer.isActive === false) {
      throw new NotFoundException('User not found');
    }

    const key = pairKey(userId, peerUserId);
    let conversation = await this.conversations.findOne({ pairKey: key }).exec();
    if (!conversation) {
      conversation = await this.conversations.create({
        pairKey: key,
        participantIds: [userId, peerUserId].sort(),
        lastMessageText: '',
        unreadCounts: { [userId]: 0, [peerUserId]: 0 },
      });
    }

    return this.conversationPayload(conversation, userId, peer, false);
  }

  async getMessages(
    userId: string,
    roles: string[],
    conversationId: string,
    limit = 50,
    before?: string,
  ) {
    const { conversation, isObserver } = await this.requireParticipantOrOversee(
      conversationId,
      userId,
      roles,
    );
    const lim = Math.min(Math.max(limit || 50, 1), 100);
    const filter: Record<string, unknown> = { conversationId: String(conversation._id) };
    if (before && Types.ObjectId.isValid(before)) {
      filter._id = { $lt: new Types.ObjectId(before) };
    }

    const rows = await this.messages
      .find(filter)
      .sort({ _id: -1 })
      .limit(lim)
      .lean()
      .exec();

    return {
      data: rows.reverse().map((m) => this.messagePayload(m)),
      conversationId: String(conversation._id),
      isObserver,
      retentionDays: 7,
    };
  }

  async sendMessage(
    userId: string,
    conversationId: string,
    text: string | undefined,
    attachments?: ChatAttachmentMetaDto[],
  ) {
    const cleaned = (text ?? '').trim();
    const files = attachments ?? [];
    if (!cleaned && !files.length) {
      throw new BadRequestException('Message cannot be empty');
    }

    const conversation = await this.requireParticipant(conversationId, userId);
    const peerId = conversation.participantIds.find((id) => id !== userId);
    if (!peerId) throw new BadRequestException('Invalid conversation');

    const storedAttachments: ChatAttachment[] = [];
    for (const att of files.slice(0, 5)) {
      this.storage.assertOwnedKey(String(conversation._id), att.key);
      const storageKind = this.storage.isS3Enabled() ? 's3' : 'local';
      const exists = await this.storage.headExists(att.key, storageKind);
      if (!exists) {
        throw new BadRequestException(`Attachment not found: ${att.fileName}`);
      }
      storedAttachments.push({
        key: att.key,
        fileName: att.fileName,
        mimeType: att.mimeType || 'application/octet-stream',
        sizeBytes: att.sizeBytes || 0,
        storage: storageKind,
      } as ChatAttachment);
    }

    const preview =
      cleaned ||
      (storedAttachments.length
        ? `📎 ${storedAttachments.map((a) => a.fileName).join(', ')}`
        : '');

    const message = await this.messages.create({
      conversationId: String(conversation._id),
      senderId: userId,
      text: cleaned,
      attachments: storedAttachments,
      readBy: [userId],
    });

    const unread = { ...(conversation.unreadCounts || {}) };
    unread[userId] = 0;
    unread[peerId] = Number(unread[peerId] ?? 0) + 1;

    conversation.lastMessageText = preview;
    conversation.lastMessageAt = new Date();
    conversation.lastMessageSenderId = userId;
    conversation.unreadCounts = unread;
    await conversation.save();

    const payload = this.messagePayload(message);
    const eventBody = {
      conversationId: String(conversation._id),
      message: payload,
    };
    this.events.emitToUser(peerId, 'chat:message', eventBody);
    this.events.emitToUser(userId, 'chat:message', eventBody);
    this.events.emitToUser(peerId, 'chat:conversation-updated', {
      conversationId: String(conversation._id),
    });
    this.events.emitToUser(userId, 'chat:conversation-updated', {
      conversationId: String(conversation._id),
    });
    this.events.emitToRoom('chat:oversight', 'chat:conversation-updated', {
      conversationId: String(conversation._id),
    });
    this.events.emitToRoom('chat:oversight', 'chat:message', eventBody);

    return payload;
  }

  async markRead(userId: string, roles: string[], conversationId: string) {
    const { conversation, isObserver } = await this.requireParticipantOrOversee(
      conversationId,
      userId,
      roles,
    );
    if (isObserver) {
      return { ok: true, observed: true };
    }

    const unread = { ...(conversation.unreadCounts || {}), [userId]: 0 };
    conversation.unreadCounts = unread;
    await conversation.save();

    await this.messages.updateMany(
      {
        conversationId: String(conversation._id),
        senderId: { $ne: userId },
        readBy: { $ne: userId },
      },
      { $addToSet: { readBy: userId } },
    );

    this.events.emitToUser(userId, 'chat:conversation-updated', {
      conversationId: String(conversation._id),
    });

    return { ok: true };
  }

  async presignAttachment(
    userId: string,
    conversationId: string,
    fileName: string,
    contentType: string,
    fileSizeBytes: number,
  ) {
    await this.requireParticipant(conversationId, userId);
    return this.storage.createPresignedUpload(
      conversationId,
      fileName,
      contentType,
      fileSizeBytes,
    );
  }

  async saveLocalAttachment(
    userId: string,
    conversationId: string,
    key: string,
    fileName: string,
    mimeType: string,
    buffer: Buffer | undefined,
  ) {
    await this.requireParticipant(conversationId, userId);
    if (!buffer?.length) {
      throw new BadRequestException('File is required');
    }
    if (!key) {
      throw new BadRequestException('Attachment key is required');
    }
    this.storage.assertOwnedKey(conversationId, key);
    if (this.storage.isS3Enabled()) {
      throw new BadRequestException('Use presigned S3 upload for this environment');
    }
    await this.storage.saveLocalUpload(key, buffer);
    return {
      key,
      fileName,
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: buffer.length,
      storage: 'local' as const,
    };
  }

  async getAttachmentDownload(
    userId: string,
    roles: string[],
    conversationId: string,
    messageId: string,
    attachmentIndex: number,
  ) {
    await this.requireParticipantOrOversee(conversationId, userId, roles);
    if (!Types.ObjectId.isValid(messageId)) {
      throw new BadRequestException('Invalid message');
    }
    const message = await this.messages.findById(messageId).lean().exec();
    if (!message || String(message.conversationId) !== conversationId) {
      throw new NotFoundException('Message not found');
    }
    const attachments = (message.attachments as ChatAttachment[]) ?? [];
    const att = attachments[attachmentIndex];
    if (!att) throw new NotFoundException('Attachment not found');

    const download = await this.storage.createDownloadUrl(
      att.key,
      att.storage || 's3',
      att.fileName,
    );
    return {
      fileName: att.fileName,
      mimeType: att.mimeType,
      sizeBytes: att.sizeBytes,
      storage: att.storage || 's3',
      downloadUrl: download.url || null,
      stream: download.mode === 'stream-token',
      key: att.key,
    };
  }

  openLocalAttachmentStream(key: string) {
    return this.storage.openLocalReadStream(key);
  }

  private async requireParticipant(conversationId: string, userId: string) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Invalid conversation');
    }
    const conversation = await this.conversations.findById(conversationId).exec();
    if (!conversation) throw new NotFoundException('Conversation not found');
    if (!conversation.participantIds.includes(userId)) {
      throw new ForbiddenException('Not a participant');
    }
    return conversation;
  }

  private async requireParticipantOrOversee(
    conversationId: string,
    userId: string,
    roles: string[],
  ) {
    if (!Types.ObjectId.isValid(conversationId)) {
      throw new BadRequestException('Invalid conversation');
    }
    const conversation = await this.conversations.findById(conversationId).exec();
    if (!conversation) throw new NotFoundException('Conversation not found');
    const isParticipant = conversation.participantIds.includes(userId);
    if (!isParticipant && !isOversight(roles)) {
      throw new ForbiddenException('Not a participant');
    }
    return { conversation, isObserver: !isParticipant && isOversight(roles) };
  }

  private conversationPayload(
    conversation: Conversation,
    userId: string,
    peer: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      roles?: string[];
    },
    isObserver: boolean,
  ) {
    return {
      id: String(conversation._id),
      peerId: peer.id,
      peerName: `${peer.firstName} ${peer.lastName}`.trim(),
      peerEmail: peer.email,
      peerRoles: peer.roles ?? [],
      participantIds: conversation.participantIds,
      participants: [
        {
          id: peer.id,
          name: `${peer.firstName} ${peer.lastName}`.trim(),
          email: peer.email,
          roles: peer.roles ?? [],
        },
      ],
      isObserver,
      lastMessageText: conversation.lastMessageText ?? '',
      lastMessageAt: conversation.lastMessageAt ?? null,
      lastMessageSenderId: conversation.lastMessageSenderId ?? null,
      unread: isObserver ? 0 : Number(conversation.unreadCounts?.[userId] ?? 0),
    };
  }

  private messagePayload(m: ChatMessage | Record<string, unknown>) {
    const row = m as ChatMessage & { _id?: Types.ObjectId; createdAt?: Date };
    const attachments = ((row.attachments as ChatAttachment[]) ?? []).map((a) => ({
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      storage: a.storage,
    }));
    return {
      id: String(row._id),
      conversationId: String(row.conversationId),
      senderId: String(row.senderId),
      text: String(row.text ?? ''),
      attachments,
      readBy: (row.readBy as string[]) ?? [],
      createdAt: row.createdAt ?? (row as { createdAt?: Date }).createdAt,
    };
  }

  /** Roles allowed to use in-app chat */
  static chatRoles = [
    SystemRole.SUPER_ADMIN,
    SystemRole.ADMIN,
    SystemRole.EMPLOYEE,
    SystemRole.DB_ADMIN,
  ];
}
