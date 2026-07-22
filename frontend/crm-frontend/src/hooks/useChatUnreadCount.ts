'use client';

import { useCallback, useEffect, useState } from 'react';
import { chatService } from '@/lib/api/chat.service';
import { connectSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';

/** Live total of unread chat messages for the signed-in user (nav badge). */
export function useChatUnreadCount() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [unreadCount, setUnreadCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!useAuthStore.getState().accessToken || !useAuthStore.getState().isAuthenticated) {
      setUnreadCount(0);
      return;
    }
    try {
      const { conversations } = await chatService.listConversations('mine');
      const total = conversations.reduce(
        (sum, c) => sum + (c.unread > 0 ? c.unread : 0),
        0,
      );
      setUnreadCount(total);
    } catch {
      /* chat optional for layouts that load before API is ready */
    }
  }, []);

  useEffect(() => {
    if (!accessToken || !isAuthenticated) {
      setUnreadCount(0);
      return;
    }

    void refresh();

    const socket = connectSocket(accessToken);
    const onChange = () => {
      void refresh();
    };

    socket.on('chat:message', onChange);
    socket.on('chat:conversation-updated', onChange);
    return () => {
      socket.off('chat:message', onChange);
      socket.off('chat:conversation-updated', onChange);
    };
  }, [accessToken, isAuthenticated, refresh]);

  return unreadCount;
}
