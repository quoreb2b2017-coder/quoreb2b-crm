import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Conversation } from './schemas/conversation.schema';
import { ChatMessage } from './schemas/chat-message.schema';
import { UsersService } from '../users/users.service';
import { EventsGateway } from '../../events/events.gateway';
import { SystemRole } from '../../common/constants/roles.constant';

function pairKey(a: string, b: string): string {
  return [a, b].sort().join(':');
}

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(Conversation.name) private readonly conversations: Model<Conversation>,
    @InjectModel(ChatMessage.name) private readonly messages: Model<ChatMessage>,
    private readonly usersService: UsersService,
    private readonly events: EventsGateway,
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

  async listConversations(userId: string) {
    const rows = await this.conversations
      .find({ participantIds: userId })
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .limit(200)
      .lean()
      .exec();

    const peerIds = [
      ...new Set(
        rows.flatMap((c) => (c.participantIds as string[]).filter((id) => id !== userId)),
      ),
    ];
    const peers = await this.usersService.findUsersByIds(peerIds);
    const peerMap = new Map(peers.map((p) => [p.id, p]));

    return {
      data: rows.map((c) => {
        const peerId = (c.participantIds as string[]).find((id) => id !== userId) ?? '';
        const peer = peerMap.get(peerId);
        return {
          id: String(c._id),
          peerId,
          peerName: peer
            ? `${peer.firstName} ${peer.lastName}`.trim()
            : 'Unknown user',
          peerEmail: peer?.email ?? '',
          peerRoles: peer?.roles ?? [],
          lastMessageText: c.lastMessageText ?? '',
          lastMessageAt: c.lastMessageAt ?? null,
          lastMessageSenderId: c.lastMessageSenderId ?? null,
          unread: Number((c.unreadCounts as Record<string, number>)?.[userId] ?? 0),
        };
      }),
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

    return this.conversationPayload(conversation, userId, peer);
  }

  async getMessages(userId: string, conversationId: string, limit = 50, before?: string) {
    const conversation = await this.requireParticipant(conversationId, userId);
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
    };
  }

  async sendMessage(userId: string, conversationId: string, text: string) {
    const cleaned = text.trim();
    if (!cleaned) throw new BadRequestException('Message cannot be empty');

    const conversation = await this.requireParticipant(conversationId, userId);
    const peerId = conversation.participantIds.find((id) => id !== userId);
    if (!peerId) throw new BadRequestException('Invalid conversation');

    const message = await this.messages.create({
      conversationId: String(conversation._id),
      senderId: userId,
      text: cleaned,
      readBy: [userId],
    });

    const unread = { ...(conversation.unreadCounts || {}) };
    unread[userId] = 0;
    unread[peerId] = Number(unread[peerId] ?? 0) + 1;

    conversation.lastMessageText = cleaned;
    conversation.lastMessageAt = new Date();
    conversation.lastMessageSenderId = userId;
    conversation.unreadCounts = unread;
    await conversation.save();

    const payload = this.messagePayload(message);
    this.events.emitToUser(peerId, 'chat:message', {
      conversationId: String(conversation._id),
      message: payload,
    });
    this.events.emitToUser(userId, 'chat:message', {
      conversationId: String(conversation._id),
      message: payload,
    });
    this.events.emitToUser(peerId, 'chat:conversation-updated', {
      conversationId: String(conversation._id),
    });
    this.events.emitToUser(userId, 'chat:conversation-updated', {
      conversationId: String(conversation._id),
    });

    return payload;
  }

  async markRead(userId: string, conversationId: string) {
    const conversation = await this.requireParticipant(conversationId, userId);
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
  ) {
    return {
      id: String(conversation._id),
      peerId: peer.id,
      peerName: `${peer.firstName} ${peer.lastName}`.trim(),
      peerEmail: peer.email,
      peerRoles: peer.roles ?? [],
      lastMessageText: conversation.lastMessageText ?? '',
      lastMessageAt: conversation.lastMessageAt ?? null,
      lastMessageSenderId: conversation.lastMessageSenderId ?? null,
      unread: Number(conversation.unreadCounts?.[userId] ?? 0),
    };
  }

  private messagePayload(m: ChatMessage | Record<string, unknown>) {
    const row = m as ChatMessage & { _id?: Types.ObjectId; createdAt?: Date };
    return {
      id: String(row._id),
      conversationId: String(row.conversationId),
      senderId: String(row.senderId),
      text: String(row.text),
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
