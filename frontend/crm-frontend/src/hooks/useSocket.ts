'use client';

import { useEffect } from 'react';
import { connectSocket, disconnectSocket, getSocket } from '@/lib/socket/socket.client';
import { useAuthStore } from '@/store/auth.store';

export function useSocket(event: string, handler: (data: unknown) => void) {
  const accessToken = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!accessToken) return;
    const socket = connectSocket(accessToken);
    socket.on(event, handler);
    return () => {
      socket.off(event, handler);
    };
  }, [accessToken, event, handler]);

  useEffect(() => {
    return () => disconnectSocket();
  }, []);
}
