import { describe, it, expect } from 'vitest';

import {
  createDemoSignature,
  verifyDemoSession,
  DEMO_SESSION_MAX_AGE_MS,
} from '@/lib/auth/demo-session';

describe('demo-session HMAC security module', () => {
  it('generates a deterministic 64-character hex signature for a timestamp', () => {
    const timestamp = '1700000000000';
    const sig1 = createDemoSignature(timestamp);
    const sig2 = createDemoSignature(timestamp);

    expect(sig1).toHaveLength(64);
    expect(sig1).toBe(sig2);
  });

  it('validates a valid, current timestamp and signature', () => {
    const now = Date.now().toString();
    const signature = createDemoSignature(now);

    expect(verifyDemoSession(now, signature)).toBe(true);
  });

  it('rejects an altered or forged signature', () => {
    const now = Date.now().toString();
    const signature = createDemoSignature(now);
    const forged = signature.substring(0, 60) + 'beef';

    expect(verifyDemoSession(now, forged)).toBe(false);
  });

  it('rejects an expired timestamp beyond DEMO_SESSION_MAX_AGE_MS', () => {
    const expiredTime = (
      Date.now() -
      DEMO_SESSION_MAX_AGE_MS -
      10000
    ).toString();
    const signature = createDemoSignature(expiredTime);

    expect(verifyDemoSession(expiredTime, signature)).toBe(false);
  });

  it('rejects missing or empty timestamp or signature', () => {
    expect(verifyDemoSession(undefined, 'valid-sig')).toBe(false);
    expect(verifyDemoSession('1700000000000', undefined)).toBe(false);
    expect(verifyDemoSession('', '')).toBe(false);
    expect(verifyDemoSession('invalid-number', 'some-sig')).toBe(false);
  });
});
