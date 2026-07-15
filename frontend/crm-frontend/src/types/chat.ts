export interface ChatContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
  roles: string[];
  displayName: string;
}

export interface ChatParticipant {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export interface ChatConversation {
  id: string;
  peerId: string;
  peerName: string;
  peerEmail: string;
  peerRoles: string[];
  participantIds?: string[];
  participants?: ChatParticipant[];
  isObserver?: boolean;
  lastMessageText: string;
  lastMessageAt: string | null;
  lastMessageSenderId: string | null;
  unread: number;
}

export interface ChatAttachment {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storage?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  attachments?: ChatAttachment[];
  readBy: string[];
  createdAt?: string;
}
