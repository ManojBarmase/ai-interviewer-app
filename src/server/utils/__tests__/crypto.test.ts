import crypto from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  decryptText,
  encryptText,
  getEncryptionKey,
  safeDecryptText,
} from '@/server/utils/crypto';

describe('crypto utility (AES-256-GCM)', () => {
  const originalEnvKey = process.env.DATABASE_ENCRYPTION_KEY;

  beforeEach(() => {
    delete process.env.DATABASE_ENCRYPTION_KEY;
  });

  afterEach(() => {
    if (originalEnvKey !== undefined) {
      process.env.DATABASE_ENCRYPTION_KEY = originalEnvKey;
    } else {
      delete process.env.DATABASE_ENCRYPTION_KEY;
    }
  });

  describe('encryptText and decryptText roundtrip', () => {
    it('encrypts and decrypts a simple ASCII string', () => {
      const plainText = 'Candidate has strong proficiency in React 19.';
      const cipherText = encryptText(plainText);

      expect(cipherText).not.toBe(plainText);
      expect(typeof cipherText).toBe('string');
      // Hex string format
      expect(/^[0-9a-fA-F]+$/.test(cipherText)).toBe(true);

      const decrypted = decryptText(cipherText);
      expect(decrypted).toBe(plainText);
    });

    it('encrypts and decrypts multi-line structured narrative text', () => {
      const detailedFeedback = `
- Mastery over React Server Components (RSC)
- Strong understanding of streaming SSR and hydration
- Articulate communication under high-pressure scenarios

Actionable Recommendations:
1. Deepen understanding of Edge Worker runtime constraints.
2. Practice back-of-the-envelope capacity planning.
      `.trim();

      const cipherText = encryptText(detailedFeedback);
      expect(cipherText).not.toBe(detailedFeedback);

      const decrypted = decryptText(cipherText);
      expect(decrypted).toBe(detailedFeedback);
    });

    it('encrypts and decrypts UTF-8, unicode, and emoji characters correctly', () => {
      const complexText =
        'Candidate 🌟 performed exceptionally well on 算法 (algorithms) & architecture! 🚀💯';

      const cipherText = encryptText(complexText);
      const decrypted = decryptText(cipherText);

      expect(decrypted).toBe(complexText);
    });

    it('generates distinct ciphertexts for identical plaintext due to random IV', () => {
      const plainText =
        'Identical evaluation summary for testing IV randomness';

      const cipherText1 = encryptText(plainText);
      const cipherText2 = encryptText(plainText);

      expect(cipherText1).not.toBe(cipherText2);
      expect(decryptText(cipherText1)).toBe(plainText);
      expect(decryptText(cipherText2)).toBe(plainText);
    });

    it('handles empty string gracefully', () => {
      expect(encryptText('')).toBe('');
      expect(decryptText('')).toBe('');
    });
  });

  describe('tamper detection and authentication failure', () => {
    it('throws error when ciphertext payload is corrupted (bit flipping attack)', () => {
      const plainText = 'Confidential hiring decision: STRONG_YES';
      const cipherText = encryptText(plainText);

      // Flip a byte in the encrypted ciphertext portion
      const buffer = Buffer.from(cipherText, 'hex');
      buffer[buffer.length - 1] = buffer[buffer.length - 1]! ^ 0xff;
      const tamperedHex = buffer.toString('hex');

      expect(() => decryptText(tamperedHex)).toThrow(/Decryption failed/i);
    });

    it('throws error when authentication tag is tampered with', () => {
      const plainText = 'Highly confidential salary feedback';
      const cipherText = encryptText(plainText);

      // Auth tag is located at bytes 16..31
      const buffer = Buffer.from(cipherText, 'hex');
      buffer[20] = buffer[20]! ^ 0x01;
      const tamperedHex = buffer.toString('hex');

      expect(() => decryptText(tamperedHex)).toThrow(/Decryption failed/i);
    });

    it('throws error on invalid or truncated ciphertext', () => {
      expect(() => decryptText('abcdef123456')).toThrow(
        /Invalid ciphertext length/i,
      );
    });

    it('throws error when attempting to decrypt with a different key', () => {
      process.env.DATABASE_ENCRYPTION_KEY =
        'key-number-one-must-be-secure-32bytes!';
      const cipherText = encryptText('Secret narrative');

      // Change key for decryption
      process.env.DATABASE_ENCRYPTION_KEY =
        'key-number-two-must-be-secure-32bytes!';
      expect(() => decryptText(cipherText)).toThrow(/Decryption failed/i);
    });
  });

  describe('key derivation from DATABASE_ENCRYPTION_KEY', () => {
    it('derives 32-byte key from standard passphrase', () => {
      process.env.DATABASE_ENCRYPTION_KEY = 'custom-passphrase';
      const key = getEncryptionKey();

      expect(Buffer.isBuffer(key)).toBe(true);
      expect(key.length).toBe(32);
    });

    it('parses 64-char hex key directly as 32 raw bytes', () => {
      const hexKey = crypto.randomBytes(32).toString('hex');
      process.env.DATABASE_ENCRYPTION_KEY = hexKey;

      const key = getEncryptionKey();
      expect(key.toString('hex')).toBe(hexKey);
    });

    it('uses fallback key when DATABASE_ENCRYPTION_KEY is unset or empty', () => {
      delete process.env.DATABASE_ENCRYPTION_KEY;
      const key1 = getEncryptionKey();

      process.env.DATABASE_ENCRYPTION_KEY = '   ';
      const key2 = getEncryptionKey();

      expect(key1).toEqual(key2);
      expect(key1.length).toBe(32);
    });
  });

  describe('safeDecryptText', () => {
    it('decrypts valid ciphertext successfully', () => {
      const original = 'Great performance during system design.';
      const encrypted = encryptText(original);

      expect(safeDecryptText(encrypted)).toBe(original);
    });

    it('safely passes through legacy unencrypted plaintext without throwing', () => {
      const legacyPlaintext =
        'Legacy unencrypted feedback written before encryption migration.';

      expect(safeDecryptText(legacyPlaintext)).toBe(legacyPlaintext);
    });

    it('returns null or undefined as provided', () => {
      expect(safeDecryptText(null)).toBeNull();
      expect(safeDecryptText(undefined)).toBeNull();
      expect(safeDecryptText('')).toBe('');
    });
  });

  describe('interoperability with colon-delimited format', () => {
    it('decrypts colon-delimited (iv:authTag:ciphertext) strings', () => {
      const key = getEncryptionKey();
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      const plain = 'Interoperable format test';
      const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      const tag = cipher.getAuthTag();

      const colonDelimited = `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
      expect(decryptText(colonDelimited)).toBe(plain);
    });
  });
});
