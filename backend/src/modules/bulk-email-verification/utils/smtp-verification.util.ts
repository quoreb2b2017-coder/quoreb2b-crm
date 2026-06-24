import * as net from 'net';
import { randomBytes } from 'crypto';
import { EmailVerificationStatus } from '../bulk-email-verification.constants';
import { SMTP_VERIFY_TIMEOUT_MS } from '../bulk-email-verification.constants';
import { resolvePositiveInt } from './config-numbers.util';
import {
  isDefinitiveMailboxReject,
  parseSmtpCode,
} from './smtp-response-classifier.util';

export interface SmtpVerifyResult {
  status: EmailVerificationStatus;
  smtpResponse: string;
  smtpCode?: number;
  isCatchAllDomain?: boolean;
}

const STATUS_PRIORITY: Record<EmailVerificationStatus, number> = {
  [EmailVerificationStatus.VALID]: 50,
  [EmailVerificationStatus.LIKELY_VALID]: 40,
  [EmailVerificationStatus.INVALID]: 30,
  [EmailVerificationStatus.RISKY]: 20,
  [EmailVerificationStatus.CATCH_ALL]: 15,
  [EmailVerificationStatus.UNKNOWN]: 10,
};

function statusPriority(status: EmailVerificationStatus): number {
  return STATUS_PRIORITY[status] ?? 0;
}

function pickBestSmtpResult(results: SmtpVerifyResult[]): SmtpVerifyResult {
  if (!results.length) {
    return { status: EmailVerificationStatus.UNKNOWN, smtpResponse: 'all_mx_failed' };
  }

  const sorted = [...results].sort(
    (a, b) => statusPriority(b.status) - statusPriority(a.status),
  );
  return sorted[0];
}

/** Read until the final line of a multiline SMTP reply (e.g. "250 OK" not "250-"). */
function readResponse(socket: net.Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP read timeout'));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter((l) => l.length > 0);
      const last = lines[lines.length - 1];
      if (last && /^\d{3} /.test(last)) {
        cleanup();
        resolve(lines.join('\n').trim());
      }
    };

    const cleanup = () => {
      clearTimeout(timeout);
      socket.removeListener('data', onData);
    };

    socket.on('data', onData);
  });
}

async function sendCommand(
  socket: net.Socket,
  command: string,
  timeoutMs: number,
): Promise<string> {
  socket.write(`${command}\r\n`);
  return readResponse(socket, timeoutMs);
}

function ehloHost(fromEmail: string, mxHost: string): string {
  const domain = fromEmail.split('@')[1]?.trim();
  return domain || mxHost;
}

async function verifyOnHost(
  mxHost: string,
  email: string,
  fromEmail: string,
  timeoutMs: number,
): Promise<SmtpVerifyResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: mxHost, port: 25, timeout: timeoutMs });
    let settled = false;

    const finish = (result: SmtpVerifyResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.on('error', () => {
      finish({
        status: EmailVerificationStatus.UNKNOWN,
        smtpResponse: 'connection_failed',
      });
    });

    socket.on('timeout', () => {
      finish({
        status: EmailVerificationStatus.UNKNOWN,
        smtpResponse: 'connection_timeout',
      });
    });

    socket.on('connect', async () => {
      try {
        const greeting = await readResponse(socket, timeoutMs);
        if (parseSmtpCode(greeting) >= 400) {
          return finish({
            status: EmailVerificationStatus.UNKNOWN,
            smtpResponse: greeting,
            smtpCode: parseSmtpCode(greeting),
          });
        }

        await sendCommand(socket, `EHLO ${ehloHost(fromEmail, mxHost)}`, timeoutMs);
        await sendCommand(socket, `MAIL FROM:<${fromEmail}>`, timeoutMs);
        const rcpt = await sendCommand(socket, `RCPT TO:<${email}>`, timeoutMs);
        const code = parseSmtpCode(rcpt);
        await sendCommand(socket, 'QUIT', timeoutMs).catch(() => undefined);

        if (code === 250) {
          return finish({
            status: EmailVerificationStatus.VALID,
            smtpResponse: rcpt,
            smtpCode: code,
          });
        }
        if (code === 251) {
          return finish({
            status: EmailVerificationStatus.LIKELY_VALID,
            smtpResponse: rcpt,
            smtpCode: code,
          });
        }
        if (code === 450 || code === 451 || code === 452) {
          return finish({
            status: EmailVerificationStatus.RISKY,
            smtpResponse: rcpt,
            smtpCode: code,
          });
        }
        if (code === 550 || code === 551 || code === 553) {
          if (isDefinitiveMailboxReject(rcpt, code)) {
            return finish({
              status: EmailVerificationStatus.INVALID,
              smtpResponse: rcpt,
              smtpCode: code,
            });
          }
          return finish({
            status: EmailVerificationStatus.UNKNOWN,
            smtpResponse: rcpt,
            smtpCode: code,
          });
        }
        return finish({
          status: EmailVerificationStatus.UNKNOWN,
          smtpResponse: rcpt,
          smtpCode: code,
        });
      } catch (err) {
        finish({
          status: EmailVerificationStatus.UNKNOWN,
          smtpResponse: err instanceof Error ? err.message : 'smtp_error',
        });
      }
    });
  });
}

export async function verifyEmailSmtp(
  email: string,
  mxHosts: string[],
  fromEmail: string,
  timeoutMs: unknown = SMTP_VERIFY_TIMEOUT_MS,
): Promise<SmtpVerifyResult> {
  const timeout = resolvePositiveInt(timeoutMs, SMTP_VERIFY_TIMEOUT_MS);
  if (!mxHosts.length) {
    return { status: EmailVerificationStatus.INVALID, smtpResponse: 'no_mx' };
  }

  const hosts = mxHosts.slice(0, 3);
  const results = await Promise.all(
    hosts.map((host) => verifyOnHost(host, email, fromEmail, timeout)),
  );

  return pickBestSmtpResult(results);
}

export async function detectCatchAllDomain(
  domain: string,
  mxHosts: string[],
  fromEmail: string,
  timeoutMs: unknown = SMTP_VERIFY_TIMEOUT_MS,
): Promise<boolean> {
  const randomLocal = `no-reply-${randomBytes(6).toString('hex')}`;
  const probe = `${randomLocal}@${domain}`;
  const result = await verifyEmailSmtp(probe, mxHosts, fromEmail, timeoutMs);
  return (
    result.status === EmailVerificationStatus.VALID ||
    result.status === EmailVerificationStatus.LIKELY_VALID
  );
}
