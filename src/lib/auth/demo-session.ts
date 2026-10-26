import 'server-only';

import crypto from 'node:crypto';

import { DEMO_USER_ID } from '@/lib/constants';

/**
 * 24-hour expiration duration in milliseconds for demo candidate sessions
 */
export const DEMO_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Derives the server HMAC key for demo guest session tokens.
 */
function getDemoSessionSecret(): string {
  return (
    process.env.DEMO_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    'ai-interviewer-enterprise-demo-secret-key-salt-2026'
  );
}

/**
 * Computes an HMAC-SHA256 signature for a demo candidate session timestamp and user ID.
 */
export function createDemoSignature(timestamp: string): string {
  const secret = getDemoSessionSecret();
  return crypto
    .createHmac('sha256', secret)
    .update(`demo-session:${timestamp}:${DEMO_USER_ID}`)
    .digest('hex');
}

/**
 * Validates whether a given timestamp and HMAC-SHA256 signature are authentic and unexpired.
 */
export function verifyDemoSession(
  timestamp: string | undefined | null,
  signature: string | undefined | null,
): boolean {
  if (!timestamp || !signature) {
    return false;
  }

  const createdAtMs = parseInt(timestamp, 10);
  if (isNaN(createdAtMs)) {
    return false;
  }

  // Enforce 24-hour expiration
  if (Date.now() - createdAtMs > DEMO_SESSION_MAX_AGE_MS) {
    return false;
  }

  try {
    const expectedSignature = createDemoSignature(timestamp);
    const expectedBuf = Buffer.from(expectedSignature, 'hex');
    const actualBuf = Buffer.from(signature, 'hex');

    if (expectedBuf.length !== actualBuf.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuf, actualBuf);
  } catch {
    return false;
  }
}
