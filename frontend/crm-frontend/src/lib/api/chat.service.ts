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

export type ChatAttachmentMeta = {
  key: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
};

export const chatService = {
  async listContacts(): Promise<ChatContact[]> {
    const res = await apiClient.get('chat/contacts');
    return unwrapList<ChatContact>(res);
  },

  async listConversations(mode: 'mine' | 'oversight' = 'mine'): Promise<{
    conversations: ChatConversation[];
    oversight: boolean;
    retentionDays: number;
  }> {
    const res = await apiClient.get('chat/conversations', { params: { mode } });
    const body = unwrap<{
      data?: ChatConversation[];
      oversight?: boolean;
      retentionDays?: number;
    }>(res);
    const conversations = Array.isArray(body)
      ? (body as unknown as ChatConversation[])
      : Array.isArray(body?.data)
        ? body.data
        : [];
    return {
      conversations,
      oversight: Boolean(body && !Array.isArray(body) && body.oversight),
      retentionDays:
        body && !Array.isArray(body) && typeof body.retentionDays === 'number'
          ? body.retentionDays
          : 7,
    };
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

  async sendMessage(
    conversationId: string,
    payload: { text?: string; attachments?: ChatAttachmentMeta[] },
  ): Promise<ChatMessage> {
    const res = await apiClient.post(`chat/conversations/${conversationId}/messages`, payload);
    return unwrap<ChatMessage>(res);
  },

  async markRead(conversationId: string): Promise<void> {
    await apiClient.patch(`chat/conversations/${conversationId}/read`);
  },

  async presignAttachment(
    conversationId: string,
    file: { fileName: string; contentType: string; fileSizeBytes: number },
  ): Promise<{
    key: string;
    uploadUrl: string | null;
    storage: 's3' | 'local';
    expiresIn: number;
  }> {
    const res = await apiClient.post(`chat/conversations/${conversationId}/attachments/presign`, file);
    return unwrap(res);
  },

  async uploadLocalAttachment(
    conversationId: string,
    key: string,
    file: File,
  ): Promise<ChatAttachmentMeta> {
    const form = new FormData();
    form.append('file', file);
    form.append('key', key);
    const res = await apiClient.post(
      `chat/conversations/${conversationId}/attachments/local`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return unwrap(res);
  },

  async downloadAttachment(
    conversationId: string,
    messageId: string,
    index: number,
  ): Promise<void> {
    const res = await apiClient.get(
      `chat/conversations/${conversationId}/messages/${messageId}/attachments/${index}/download`,
    );
    const info = unwrap<{
      downloadUrl?: string | null;
      stream?: boolean;
      fileName: string;
      mimeType?: string;
    }>(res);

    if (info.downloadUrl) {
      window.open(info.downloadUrl, '_blank', 'noopener,noreferrer');
      return;
    }

    const fileRes = await apiClient.get(
      `chat/conversations/${conversationId}/messages/${messageId}/attachments/${index}/file`,
      { responseType: 'blob' },
    );
    const blob = new Blob([fileRes.data], {
      type: info.mimeType || 'application/octet-stream',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = info.fileName || 'download';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
