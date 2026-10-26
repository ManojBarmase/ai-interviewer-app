import { type NextRequest } from 'next/server';

import { createSessionLogger } from '@/lib/logger';
import { evaluationService } from '@/server/services/evaluation.service';
import { handleApiError, ok } from '@/server/utils/api-response';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

export async function POST(req: NextRequest) {
  let log = createSessionLogger('eval', { route: '/api/interview/evaluate' });

  try {
    const [body, authUser] = await Promise.all([
      req.json(),
      getAuthenticatedUser(req),
    ]);

    log = createSessionLogger(body?.sessionId, {
      route: '/api/interview/evaluate',
      userId: authUser.userId,
    });

    await applyRateLimit(authUser.userId, '/api/interview/evaluate', 'eval');

    const result = await evaluationService.evaluateInterview(body, {
      id: authUser.userId,
      email: authUser.email,
      firstName: authUser.firstName,
    });

    const { _persistenceWarning, ...evaluation } = result;

    return ok({
      success: true,
      evaluation,
      ...(_persistenceWarning ? { warning: _persistenceWarning } : {}),
    });
  } catch (error) {
    return handleApiError(error, log);
  }
}
