export interface ChatContact {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  employeeId?: string;
  roles: string[];
  displayName: string;
}

export interface ChatConversation {
  id: string;
  peerId: string;
  peerName: string;
  peerEmail: string;
  peerRoles: string[];
  lastMessageText: string;
  lastMessageAt: string | null;
  lastMessageSenderId: string | null;
  unread: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  text: string;
  readBy: string[];
  createdAt?: string;
}
