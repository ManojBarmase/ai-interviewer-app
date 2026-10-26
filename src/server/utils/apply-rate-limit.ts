import 'server-only';

import { createSessionLogger } from '@/lib/logger';
import { RateLimitError } from '@/server/errors/AppError';
import { rateLimit } from '@/server/integrations/cache/ratelimit';

/**
 * Applies sliding-window rate limiting per identifier.
 * Throws RateLimitError if the rate limit is exceeded.
 * Logs a warning and fails open if Redis/cache is unavailable.
 */
export async function applyRateLimit(
  identifier: string,
  routeName: string,
): Promise<void> {
  try {
    const result = await rateLimit.limit(identifier);
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
    });
    logger.warn(
      { err: rateLimitError },
      'Rate limiter unavailable — failing open',
    );
  }
}
