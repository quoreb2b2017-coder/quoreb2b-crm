import apiClient from '@/lib/api/client';
import type { ChatContact, ChatConversation, ChatMessage } from '@/types/chat';

function unwrap<T>(response: { data: unknown }): T {
  const body = response.data as { data?: T };
  return (body?.data ?? body) as T;
}

function unwrapList<T>(response: { data: unknown }): T[] {
  const body = unwrap<{ data?: T[] } | T[]>(response);
  if (Array.isArray(body)) return body;
  if (body && typeof body === 'object' && Array.isArray((body as { data?: T[] }).data)) {
    return (body as { data: T[] }).data;
  }
  return [];
}

export const chatService = {
  async listContacts(): Promise<ChatContact[]> {
    const res = await apiClient.get('chat/contacts');
    return unwrapList<ChatContact>(res);
  },

  async listConversations(): Promise<ChatConversation[]> {
    const res = await apiClient.get('chat/conversations');
    return unwrapList<ChatConversation>(res);
  },

  async startConversation(peerUserId: string): Promise<ChatConversation> {
    const res = await apiClient.post('chat/conversations', { peerUserId });
    return unwrap<ChatConversation>(res);
  },

  async getMessages(
    conversationId: string,
    params?: { limit?: number; before?: string },
  ): Promise<ChatMessage[]> {
    const res = await apiClient.get(`chat/conversations/${conversationId}/messages`, { params });
    return unwrapList<ChatMessage>(res);
  },

  async sendMessage(conversationId: string, text: string): Promise<ChatMessage> {
    const res = await apiClient.post(`chat/conversations/${conversationId}/messages`, { text });
    return unwrap<ChatMessage>(res);
  },

  async markRead(conversationId: string): Promise<void> {
    await apiClient.patch(`chat/conversations/${conversationId}/read`);
  },
};
