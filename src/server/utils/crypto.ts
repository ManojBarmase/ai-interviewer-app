/**
 * @file src/server/utils/crypto.ts
 * @description Field-Level PII Encryption & Decryption Utility
 *
 * Implements AES-256-GCM authenticated encryption for sensitive candidate
 * PII at rest (interview transcripts, evaluation strengths/weaknesses, narrative feedback).
 *
 * Security Architecture:
 * - Cipher: AES-256-GCM (Authenticated Encryption with Associated Data)
 * - Key Length: 256 bits (32 bytes), derived from DATABASE_ENCRYPTION_KEY
 * - IV: 128 bits (16 bytes), cryptographically random per encryption operation
 * - Auth Tag: 128 bits (16 bytes), detects tampering / bit-flipping attacks
 * - Payload Format: [IV (16B)][Auth Tag (16B)][Encrypted Ciphertext (NB)] encoded as hex
 */

import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 16;
const AUTH_TAG_LENGTH_BYTES = 16;

/**
 * Deterministic fallback key for development, staging, and isolated unit test environments.
 * In production, DATABASE_ENCRYPTION_KEY must be provided via secure secret management.
 */
const DEV_FALLBACK_KEY = 'ai-interviewer-app-dev-database-encryption-key-32b!';

/**
 * Derives a 32-byte cryptographic key from the DATABASE_ENCRYPTION_KEY environment variable.
 * If the environment variable is a 64-character hex string, it is parsed directly as 32 raw bytes.
 * Otherwise, SHA-256 is used to deterministically derive an exact 256-bit key buffer.
 */
export function getEncryptionKey(): Buffer {
  const envKey = process.env.DATABASE_ENCRYPTION_KEY;

  if (envKey && envKey.trim().length > 0) {
    const trimmed = envKey.trim();

    // 64-character hex string (32 raw bytes)
    if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
      return Buffer.from(trimmed, 'hex');
    }

    // 32-byte Base64 string
    if (trimmed.length === 44 && trimmed.endsWith('=')) {
      const b = Buffer.from(trimmed, 'base64');
      if (b.length === 32) return b;
    }

    // String passphrase of arbitrary length hashed to 32 bytes via SHA-256
    return crypto.createHash('sha256').update(trimmed, 'utf8').digest();
  }

  // Safe fallback for dev/test
  return crypto.createHash('sha256').update(DEV_FALLBACK_KEY, 'utf8').digest();
}

/**
 * Encrypts a plaintext UTF-8 string using AES-256-GCM.
 * Prepends the 16-byte random IV and 16-byte authentication tag to the encrypted ciphertext.
 *
 * @param plainText - The raw plaintext string to encrypt
 * @returns Hex-encoded string containing [IV][AuthTag][Ciphertext]
 */
export function encryptText(plainText: string): string {
  if (!plainText) {
    return '';
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Prepend IV and authentication tag to encrypted ciphertext
  const combined = Buffer.concat([iv, authTag, encrypted]);
  return combined.toString('hex');
}

/**
 * Decrypts an AES-256-GCM hex-encoded string containing prepended IV and authentication tag.
 * Verifies authenticity and throws if data has been tampered with or corrupted.
 * Also supports colon-delimited format (iv:authTag:ciphertext) for cross-system compatibility.
 *
 * @param cipherText - Hex-encoded string with prepended IV and authentication tag
 * @returns Decrypted plaintext UTF-8 string
 * @throws Error if authentication tag fails or ciphertext is malformed
 */
export function decryptText(cipherText: string): string {
  if (!cipherText) {
    return '';
  }

  const key = getEncryptionKey();

  // 1. Support colon-delimited format: iv:authTag:ciphertext
  if (cipherText.includes(':')) {
    const parts = cipherText.split(':');
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = Buffer.from(parts[2], 'hex');

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);

      try {
        return Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]).toString('utf8');
      } catch (err) {
        throw new Error(
          `Decryption failed: integrity verification failed (${err instanceof Error ? err.message : String(err)})`,
        );
      }
    }
  }

  // 2. Standard hex-encoded combined buffer: [IV (16B)][AuthTag (16B)][Ciphertext]
  const combined = Buffer.from(cipherText, 'hex');
  const minLength = IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES;

  if (combined.length < minLength) {
    throw new Error(
      `Invalid ciphertext length: expected at least ${minLength} bytes, received ${combined.length}`,
    );
  }

  // Attempt decryption with 16-byte IV
  try {
    const iv = combined.subarray(0, IV_LENGTH_BYTES);
    const authTag = combined.subarray(
      IV_LENGTH_BYTES,
      IV_LENGTH_BYTES + AUTH_TAG_LENGTH_BYTES,
    );
    const encrypted = combined.subarray(minLength);

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString('utf8');
  } catch (primaryError) {
    // Fallback: If 16-byte IV failed and buffer has at least 28 bytes, check for 12-byte IV (NIST GCM default)
    if (combined.length >= 12 + AUTH_TAG_LENGTH_BYTES) {
      try {
        const iv12 = combined.subarray(0, 12);
        const authTag12 = combined.subarray(12, 12 + AUTH_TAG_LENGTH_BYTES);
        const encrypted12 = combined.subarray(12 + AUTH_TAG_LENGTH_BYTES);

        const decipher12 = crypto.createDecipheriv(ALGORITHM, key, iv12);
        decipher12.setAuthTag(authTag12);

        return Buffer.concat([
          decipher12.update(encrypted12),
          decipher12.final(),
        ]).toString('utf8');
      } catch {
        // Fall through to throw primary error
      }
    }

    throw new Error(
      `Decryption failed: integrity verification failed (${primaryError instanceof Error ? primaryError.message : String(primaryError)})`,
    );
  }
}

/**
 * Safely attempts decryption on a potentially encrypted string.
 * If the input is unencrypted legacy plaintext, null, or undefined, it returns
 * the original value without throwing, facilitating zero-downtime migrations.
 *
 * @param text - Plaintext or ciphertext string
 * @returns Decrypted string or original value if already plaintext / unencrypted
 */
export function safeDecryptText(text?: string | null): string | null {
  if (!text) {
    return text ?? null;
  }

  try {
    return decryptText(text);
  } catch {
    // Input is unencrypted legacy plaintext or invalid ciphertext — preserve original text
    return text;
  }
}
