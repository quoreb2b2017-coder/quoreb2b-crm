import { io, Socket } from 'socket.io-client';
import { getSocketUrl } from '@/lib/constants/api-url';

let socket: Socket | null = null;

const SOCKET_URL = getSocketUrl();

export function getSocket(): Socket {
  if (!socket) {
    socket = io(`${SOCKET_URL}/events`, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 5,
      reconnectionDelay: 2000,
      timeout: 10000,
    });
  }
  return socket;
}

export function connectSocket(token: string): Socket {
  const s = getSocket();
  s.auth = { token };
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}
