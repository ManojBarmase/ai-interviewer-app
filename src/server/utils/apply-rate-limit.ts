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

    // Redis unavailable — log warning but allow request (fail-open)
    // Secondary defense: payload size validation & service-level constraints
    const logger = createSessionLogger('rate-limit-bypass', {
      route: routeName,
      tier: selectedTier,
    });
    logger.warn(
      { err: rateLimitError },
      'Rate limiter unavailable — failing open',
    );
  }
}
