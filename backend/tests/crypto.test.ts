import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, isEncrypted } from '../src/lib/crypto.js';

describe('secrets at rest (AES-256-GCM)', () => {
  it('round-trips and never stores plaintext', () => {
    const c = encrypt('smtp-password-123');
    expect(isEncrypted(c)).toBe(true);
    expect(c).not.toContain('smtp-password-123');
    expect(decrypt(c)).toBe('smtp-password-123');
  });

  it('uses a fresh IV every time', () => {
    expect(encrypt('same')).not.toBe(encrypt('same'));
  });

  it('rejects tampered ciphertext', () => {
    const c = encrypt('secret');
    const tampered = c.slice(0, -4) + (c.endsWith('AAAA') ? 'BBBB' : 'AAAA');
    expect(() => decrypt(tampered)).toThrow();
  });

  it('passes legacy plaintext through (migrated on boot)', () => {
    expect(decrypt('old-plain-value')).toBe('old-plain-value');
  });
});
