import crypto from 'node:crypto';
import { config } from '../config.js';

/**
 * AES-256-GCM encryption for secrets stored in Postgres (SMTP passwords, Slack
 * webhook URLs / tokens). A DB dump or leaked backup then doesn't leak credentials.
 *
 * Format: "enc:v1:<iv b64>:<auth tag b64>:<ciphertext b64>"
 * Values without the prefix are treated as legacy plaintext (and re-encrypted on boot).
 */
const PREFIX = 'enc:v1:';

// 32-byte key from ENCRYPTION_KEY (hex/base64/any string), falling back to a key
// derived from JWT_SECRET so local dev works without extra setup.
const key = crypto.createHash('sha256').update(config.ENCRYPTION_KEY || `derived:${config.JWT_SECRET}`).digest();

export const isEncrypted = (v: string | null | undefined) => !!v && v.startsWith(PREFIX);

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
}

export function decrypt(value: string): string {
  if (!isEncrypted(value)) return value; // legacy plaintext
  const [iv, tag, data] = value.slice(PREFIX.length).split(':');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv!, 'base64'));
  decipher.setAuthTag(Buffer.from(tag!, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data!, 'base64')), decipher.final()]).toString('utf8');
}
