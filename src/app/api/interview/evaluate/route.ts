import { cookies } from 'next/headers';
import { type NextRequest } from 'next/server';

import { createSessionLogger } from '@/lib/logger';
import { createRouteHandlerClient } from '@/lib/supabase/server';
import { UnauthorizedError, RateLimitError } from '@/server/errors/AppError';
import { rateLimit } from '@/server/integrations/cache/ratelimit';
import { evaluationService } from '@/server/services/evaluation.service';
import { handleApiError, ok } from '@/server/utils/api-response';

export async function POST(req: NextRequest) {
  let log = createSessionLogger('eval', { route: '/api/interview/evaluate' });

  try {
    const [body, cookieStore, { supabase }] = await Promise.all([
      req.json(),
      cookies(),
      createRouteHandlerClient(),
    ]);
    const user = (await supabase.auth.getUser()).data.user;
    const isDemo = cookieStore.get('demo_candidate_session')?.value === 'true';
    const userId =
      user?.id ?? (isDemo ? '00000000-0000-0000-0000-000000000000' : null);

    if (!userId) throw new UnauthorizedError('Unauthorized. Please sign in.');
    log = createSessionLogger(body?.sessionId, {
      route: '/api/interview/evaluate',
      userId,
    });

    try {
      if (!(await rateLimit.limit(userId)).success) {
        throw new RateLimitError('Too many requests. Please wait.');
      }
    } catch (e) {
      if (e instanceof RateLimitError) throw e;
    }

    const email =
      user?.email ?? (isDemo ? 'demo-candidate@ai-interviewer.internal' : null);
    const firstName =
      user?.user_metadata?.first_name ?? (isDemo ? 'Demo Candidate' : null);
    const evaluation = await evaluationService.evaluateInterview(body, {
      id: userId,
      email,
      firstName,
    });

    return ok({ success: true, evaluation });
  } catch (error) {
    return handleApiError(error, log);
  }
}
