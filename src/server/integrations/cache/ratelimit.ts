import 'server-only';

import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

/**
 * Enterprise Rate Limiter (Upstash Redis via @vercel/kv)
 * Allows 10 requests per 5 minutes (300 seconds) sliding window.
 */
export const rateLimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '5 m'),
  analytics: true,
  prefix: '@upstash/ratelimit',
});
