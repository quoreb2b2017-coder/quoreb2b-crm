import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

/**
 * Reversible password vault for Super-Admin view-only access.
 * Login still uses bcrypt (passwordHash). This stores AES-GCM ciphertext.
 */
export function encryptViewablePassword(plain: string, secret: string): string {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${enc.toString('base64url')}`;
}

export function decryptViewablePassword(payload: string, secret: string): string | null {
  try {
    const [version, ivB64, tagB64, dataB64] = payload.split(':');
    if (version !== 'v1' || !ivB64 || !tagB64 || !dataB64) return null;
    const key = deriveKey(secret);
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const dec = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(`quoreb2b-pw-view:${secret}`).digest();
}
