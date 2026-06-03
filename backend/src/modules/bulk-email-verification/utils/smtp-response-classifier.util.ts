/** Parse leading SMTP status code from a response (first or last line). */
export function parseSmtpCode(response: string): number {
  const lines = response.trim().split(/\r?\n/).filter(Boolean);
  const line = lines[lines.length - 1] ?? lines[0] ?? '';
  const match = line.match(/^(\d{3})/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * True only for explicit mailbox-missing SMTP enhanced codes/phrases.
 * Generic 550 / "recipient rejected" from verification IPs are not definitive.
 */
export function isDefinitiveMailboxReject(response: string, code?: number): boolean {
  const r = response.toLowerCase();

  if (
    /\b(5\.7\.|spam|blacklist|block list|blocked|access denied|relay|prohibited|policy|tarpit|rate limit|too many|authentication required|must authenticate|unsolicited|proofpoint|barracuda|mimecast)/.test(
      r,
    )
  ) {
    return false;
  }

  if (/\b5\.1\.[0-3]\b/.test(r)) return true;

  const c = code ?? parseSmtpCode(response);
  if (c !== 550 && c !== 551 && c !== 553) return false;

  return /\b(no such user|unknown user|user unknown|mailbox not found|mailbox unavailable|invalid mailbox)\b/.test(
    r,
  );
}
