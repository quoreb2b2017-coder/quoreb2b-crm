import * as net from 'net';
import { resolvePositiveInt } from './config-numbers.util';

export interface Port25Status {
  reachable: boolean;
  message: string;
  host: string;
}

let cachedPort25: Port25Status | null = null;
let cachedPort25At = 0;
const PORT25_CACHE_MS = 10 * 60 * 1000;

/** Cached port-25 probe (avoids hammering SMTP on every diagnostics poll). */
export async function getOutboundSmtpPortStatus(
  timeoutMs: unknown = 8000,
  maxAgeMs = PORT25_CACHE_MS,
): Promise<Port25Status> {
  const now = Date.now();
  if (cachedPort25 && now - cachedPort25At < maxAgeMs) {
    return cachedPort25;
  }
  cachedPort25 = await testOutboundSmtpPort(timeoutMs);
  cachedPort25At = now;
  return cachedPort25;
}

/** Probe whether the server can open outbound SMTP (port 25) to a major MX host. */
export function testOutboundSmtpPort(
  timeoutMs: unknown = 8000,
): Promise<Port25Status> {
  const timeout = resolvePositiveInt(timeoutMs, 8000);
  const host = 'gmail-smtp-in.l.google.com';
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port: 25, timeout });
    let settled = false;

    const finish = (reachable: boolean, message: string) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ reachable, message, host });
    };

    socket.on('connect', () => {
      finish(true, 'Outbound port 25 is reachable from this server.');
    });

    socket.on('timeout', () => {
      finish(
        false,
        'Connection timed out — ISP or firewall may block outbound port 25 (common on home Windows).',
      );
    });

    socket.on('error', (err) => {
      finish(
        false,
        err instanceof Error ? err.message : 'Could not connect to port 25',
      );
    });
  });
}
