import * as net from 'net';
import { randomBytes } from 'crypto';
import { EmailVerificationStatus } from '../bulk-email-verification.constants';
import { SMTP_VERIFY_TIMEOUT_MS } from '../bulk-email-verification.constants';
import { resolvePositiveInt } from './config-numbers.util';
import {
  isDefinitiveMailboxReject,
  isSmtpIpBlocked,
  parseSmtpCode,
} from './smtp-response-classifier.util';

export interface SmtpVerifyResult {
  status: EmailVerificationStatus;
  smtpResponse: string;
  smtpCode?: number;
  isCatchAllDomain?: boolean;
}

function readResponse(socket: net.Socket, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('SMTP read timeout'));
    }, timeoutMs);

    const onData = (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      socket.setTimeout(timeoutMs);
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

function classifyRcptResponse(rcpt: string, code: number): SmtpVerifyResult {
  if (isSmtpIpBlocked(rcpt)) {
    return {
      status: EmailVerificationStatus.UNKNOWN,
      smtpResponse: `smtp_ip_blocked:${rcpt}`,
      smtpCode: code,
    };
  }

  if (code === 250) {
    return {
      status: EmailVerificationStatus.VALID,
      smtpResponse: `${rcpt}|smtp_accepted`,
      smtpCode: code,
    };
  }
  if (code === 251) {
    return {
      status: EmailVerificationStatus.LIKELY_VALID,
      smtpResponse: rcpt,
      smtpCode: code,
    };
  }
  if (code === 450 || code === 451 || code === 452) {
    return {
      status: EmailVerificationStatus.RISKY,
      smtpResponse: rcpt,
      smtpCode: code,
    };
  }
  if (code === 550 || code === 551 || code === 553) {
    if (isDefinitiveMailboxReject(rcpt, code)) {
      return {
        status: EmailVerificationStatus.INVALID,
        smtpResponse: rcpt,
        smtpCode: code,
      };
    }
    if (/\b(5\.1\.[0-3]|5\.2\.1|5\.2\.2)\b/.test(rcpt)) {
      return {
        status: EmailVerificationStatus.INVALID,
        smtpResponse: rcpt,
        smtpCode: code,
      };
    }
    return {
      status: EmailVerificationStatus.UNKNOWN,
      smtpResponse: rcpt,
      smtpCode: code,
    };
  }
  return {
    status: EmailVerificationStatus.UNKNOWN,
    smtpResponse: rcpt,
    smtpCode: code,
  };
}

async function greetAndRcpt(
  socket: net.Socket,
  email: string,
  fromEmail: string,
  mxHost: string,
  timeoutMs: number,
): Promise<SmtpVerifyResult> {
  const greeting = await readResponse(socket, timeoutMs);
  if (parseSmtpCode(greeting) >= 400) {
    return {
      status: EmailVerificationStatus.UNKNOWN,
      smtpResponse: greeting,
      smtpCode: parseSmtpCode(greeting),
    };
  }

  const helloDomain = ehloHost(fromEmail, mxHost);
  let helloOk = false;
  try {
    const ehlo = await sendCommand(socket, `EHLO ${helloDomain}`, timeoutMs);
    helloOk = parseSmtpCode(ehlo) < 400;
  } catch {
    helloOk = false;
  }
  if (!helloOk) {
    const helo = await sendCommand(socket, `HELO ${helloDomain}`, timeoutMs);
    if (parseSmtpCode(helo) >= 400) {
      return {
        status: EmailVerificationStatus.UNKNOWN,
        smtpResponse: helo,
        smtpCode: parseSmtpCode(helo),
      };
    }
  }

  const mailFrom = await sendCommand(socket, `MAIL FROM:<${fromEmail}>`, timeoutMs);
  if (parseSmtpCode(mailFrom) >= 400) {
    return {
      status: EmailVerificationStatus.UNKNOWN,
      smtpResponse: mailFrom,
      smtpCode: parseSmtpCode(mailFrom),
    };
  }

  const rcpt = await sendCommand(socket, `RCPT TO:<${email}>`, timeoutMs);
  const code = parseSmtpCode(rcpt);
  await sendCommand(socket, 'QUIT', timeoutMs).catch(() => undefined);
  return classifyRcptResponse(rcpt, code);
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
        const result = await greetAndRcpt(socket, email, fromEmail, mxHost, timeoutMs);
        finish(result);
      } catch (err) {
        finish({
          status: EmailVerificationStatus.UNKNOWN,
          smtpResponse: err instanceof Error ? err.message : 'smtp_error',
        });
      }
    });
  });
}

function isDefinitiveResult(result: SmtpVerifyResult): boolean {
  return (
    result.status === EmailVerificationStatus.VALID ||
    result.status === EmailVerificationStatus.INVALID ||
    result.status === EmailVerificationStatus.LIKELY_VALID
  );
}

/** Try MX hosts in priority order; stop on first mailbox-confirmed or hard-reject result. */
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

  let last: SmtpVerifyResult | null = null;
  for (const host of mxHosts.slice(0, 4)) {
    const result = await verifyOnHost(host, email, fromEmail, timeout);
    if (isDefinitiveResult(result)) {
      return result;
    }
    last = result;
  }

  return (
    last ?? {
      status: EmailVerificationStatus.UNKNOWN,
      smtpResponse: 'all_mx_failed',
    }
  );
}

export async function detectCatchAllDomain(
  domain: string,
  mxHosts: string[],
  fromEmail: string,
  timeoutMs: unknown = SMTP_VERIFY_TIMEOUT_MS,
): Promise<boolean> {
  const randomLocal = `no-reply-${randomBytes(8).toString('hex')}`;
  const probe = `${randomLocal}@${domain}`;
  const result = await verifyEmailSmtp(probe, mxHosts, fromEmail, timeoutMs);
  return (
    result.status === EmailVerificationStatus.VALID ||
    result.status === EmailVerificationStatus.LIKELY_VALID
  );
}
