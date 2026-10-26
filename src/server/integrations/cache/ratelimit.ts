import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

/**
 * Enterprise Tiered Rate Limiters (Upstash Redis via @vercel/kv)
 *
 * Route-specific quotas:
 * - chatRateLimit: 60 requests / 10 minutes (natural conversation back-and-forth)
 * - evalRateLimit: 5 requests / 10 minutes (heavy AI scoring generation)
 * - resumeRateLimit: 5 requests / 15 minutes (CPU-intensive PDF binary parsing)
 * - generalRateLimit: 30 requests / 5 minutes (default fallback)
 */
export const chatRateLimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(60, '10 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:chat',
});

export const evalRateLimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(5, '10 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:eval',
});

export const resumeRateLimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(5, '15 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:resume',
});

export const generalRateLimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(30, '5 m'),
  analytics: true,
  prefix: '@upstash/ratelimit:general',
});

/** Backward-compatible default rate limiter */
export const rateLimit = generalRateLimit;
