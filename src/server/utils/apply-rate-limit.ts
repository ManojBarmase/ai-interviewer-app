import 'server-only';

import { createSessionLogger } from '@/lib/logger';
import { RateLimitError } from '@/server/errors/AppError';
import {
  chatRateLimit,
  evalRateLimit,
  generalRateLimit,
  resumeRateLimit,
} from '@/server/integrations/cache/ratelimit';

import type { Ratelimit } from '@upstash/ratelimit';

export type RateLimitTier = 'chat' | 'eval' | 'resume' | 'general';

const TIER_LIMITERS: Record<RateLimitTier, Ratelimit> = {
  chat: chatRateLimit,
  eval: evalRateLimit,
  resume: resumeRateLimit,
  general: generalRateLimit,
};

function resolveTier(routeName: string, tier?: RateLimitTier): RateLimitTier {
  if (tier && tier in TIER_LIMITERS) {
    return tier;
  }
  if (routeName.includes('/chat')) return 'chat';
  if (routeName.includes('/eval')) return 'eval';
  if (routeName.includes('/resume') || routeName.includes('parse-resume')) {
    return 'resume';
  }
  return 'general';
}

let redisCircuitBreakerOpenUntil = 0;
const REDIS_CIRCUIT_BREAKER_COOLDOWN_MS = 30_000;

/** Testing helper to reset circuit breaker between unit tests. */
export function resetRateLimitCircuitBreakerForTesting(): void {
  redisCircuitBreakerOpenUntil = 0;
}

/**
 * Applies sliding-window rate limiting per identifier across tiered quotas.
 * Throws RateLimitError if the rate limit is exceeded.
 * Logs a warning and fails open if Redis/cache is unavailable.
 */
export async function applyRateLimit(
  identifier: string,
  routeName: string,
  tier?: RateLimitTier,
): Promise<void> {
  // If Redis connection previously timed out or failed DNS, fail open immediately
  // to avoid blocking the user flow with repeated DNS timeouts (bypassed in unit tests).
  if (
    process.env.NODE_ENV !== 'test' &&
    Date.now() < redisCircuitBreakerOpenUntil
  ) {
    return;
  }

  const selectedTier = resolveTier(routeName, tier);
  const limiter = TIER_LIMITERS[selectedTier];

  try {
    const result = await limiter.limit(identifier);
    if (!result.success) {
      throw new RateLimitError(
        'Too many requests. Please wait before trying again.',
      );
    }
  } catch (rateLimitError: unknown) {
    if (rateLimitError instanceof RateLimitError) {
      throw rateLimitError;
    }

    // Trip circuit breaker for 30s to shield app from repeated DNS/network latency
    redisCircuitBreakerOpenUntil =
      Date.now() + REDIS_CIRCUIT_BREAKER_COOLDOWN_MS;

    // Redis unavailable — log warning but allow request (fail-open)
    // Secondary defense: payload size validation & service-level constraints
    const logger = createSessionLogger('rate-limit-bypass', {
      route: routeName,
      tier: selectedTier,
    });
    logger.warn(
      { err: rateLimitError },
      'Rate limiter unavailable — failing open (circuit breaker engaged for 30s)',
    );
  }
}
