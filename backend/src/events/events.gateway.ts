import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { isRedisEnabled } from '../config/env';
import { buildRedisOptions } from '../redis/redis.factory';

@WebSocketGateway({
  cors: {
    origin: process.env.SOCKET_CORS_ORIGINS?.split(',') ?? [
      'http://localhost:3000',
      'http://localhost:3001',
    ],
    credentials: true,
  },
  namespace: '/events',
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private userSockets = new Map<string, Set<string>>();

  constructor(
    private jwtService: JwtService,
    private config: ConfigService,
  ) {}

  afterInit(namespaceOrServer: Server): void {
    const useAdapter =
      isRedisEnabled() && this.config.get<boolean>('SOCKET_REDIS_ADAPTER', true) !== false;
    if (!useAdapter) return;

    // Nest may pass a Namespace (has .server) rather than the root Server.
    // Namespace.adapter is a getter object — only root Server.adapter() is settable.
    const root =
      (namespaceOrServer as unknown as { server?: Server }).server ??
      (this.server as unknown as { server?: Server })?.server ??
      namespaceOrServer;

    if (typeof (root as { adapter?: unknown }).adapter !== 'function') {
      this.logger.warn('Socket.io Redis adapter skipped — root Server.adapter() unavailable');
      return;
    }

    try {
      const pub = new Redis(buildRedisOptions(this.config));
      const sub = pub.duplicate();
      (root as Server).adapter(createAdapter(pub, sub) as never);
      this.logger.log('Socket.io Redis adapter enabled — safe for multi-instance deploy');
    } catch (err) {
      this.logger.warn(
        `Socket.io Redis adapter failed: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) {
        client.disconnect();
        return;
      }
      const payload = this.jwtService.verify(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      const userId = payload.sub as string;
      const roles = (payload.roles as string[]) ?? [];
      client.join(`user:${userId}`);
      if (roles.includes('admin') || roles.includes('super_admin')) {
        client.join('chat:oversight');
      }
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, new Set());
      }
      this.userSockets.get(userId)!.add(client.id);
      this.logger.log(`Client connected: ${client.id} (user: ${userId})`);
    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    for (const [, sockets] of this.userSockets) {
      sockets.delete(client.id);
    }
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }

  emitToRoom(room: string, event: string, data: unknown) {
    this.server.to(room).emit(event, data);
  }

  broadcast(event: string, data: unknown) {
    this.server.emit(event, data);
  }
}
