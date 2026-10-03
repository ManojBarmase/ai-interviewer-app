import { Ratelimit } from '@upstash/ratelimit';
import { kv } from '@vercel/kv';

// Create a new ratelimiter that allows 10 requests per 5 minutes (300 seconds)
export const rateLimit = new Ratelimit({
  redis: kv,
  limiter: Ratelimit.slidingWindow(10, '5 m'),
  analytics: true,
  prefix: '@upstash/ratelimit',
});
