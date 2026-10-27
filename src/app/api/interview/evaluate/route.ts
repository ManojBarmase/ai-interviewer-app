import { type NextRequest } from 'next/server';

import { createSessionLogger } from '@/lib/logger';
import { ConflictError } from '@/server/errors/AppError';
import { evaluationService } from '@/server/services/evaluation.service';
import { handleApiError, ok } from '@/server/utils/api-response';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';
import {
  checkAndLockIdempotencyKey,
  releaseIdempotencyKey,
  storeIdempotentResponse,
} from '@/server/utils/idempotency';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  let log = createSessionLogger('eval', { route: '/api/interview/evaluate' });
  const rawIdempotencyKey =
    req.headers.get('idempotency-key') || req.headers.get('x-idempotency-key');
  const idempotencyKey = rawIdempotencyKey?.trim() || undefined;

  try {
    const [body, authUser] = await Promise.all([
      req.json(),
      getAuthenticatedUser(req),
    ]);

    log = createSessionLogger(body?.sessionId, {
      route: '/api/interview/evaluate',
      userId: authUser.userId,
    });

    // Check idempotency if key provided
    if (idempotencyKey) {
      const idempotency = await checkAndLockIdempotencyKey(idempotencyKey);

      if (idempotency.cachedResponse !== undefined) {
        log.info(
          { idempotencyKey },
          'Idempotent evaluation cache HIT — returning cached response',
        );
        return ok(idempotency.cachedResponse, 200, {
          'X-Cache-Lookup': 'HIT',
        });
      }

      if (idempotency.inProgress) {
        throw new ConflictError(
          'An evaluation request with this idempotency key is already in progress.',
        );
      }
    }

    await applyRateLimit(authUser.userId, '/api/interview/evaluate', 'eval');

    const result = await evaluationService.evaluateInterview(body, {
      id: authUser.userId,
      email: authUser.email,
      firstName: authUser.firstName,
    });

    const { _persistenceWarning, ...evaluation } = result;

    const payload = {
      success: true,
      evaluation,
      ...(_persistenceWarning ? { warning: _persistenceWarning } : {}),
    };

    if (idempotencyKey) {
      await storeIdempotentResponse(idempotencyKey, payload);
    }

    return ok(payload);
  } catch (error) {
    if (idempotencyKey && !(error instanceof ConflictError)) {
      await releaseIdempotencyKey(idempotencyKey);
    }
    return handleApiError(error, log);
  }
}
