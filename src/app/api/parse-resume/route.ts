import { type NextRequest } from 'next/server';

import { createSessionLogger } from '@/lib/logger';
import { AppError, BadRequestError } from '@/server/errors/AppError';
import { resumeParserService } from '@/server/services/resume-parser.service';
import { handleApiError, ok } from '@/server/utils/api-response';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

export const runtime = 'nodejs';
const MAX_PAYLOAD_SIZE = 5 * 1024 * 1024 + 64 * 1024;

export async function POST(req: NextRequest) {
  let log = createSessionLogger('parse-resume', { route: '/api/parse-resume' });

  try {
    const authUser = await getAuthenticatedUser(req);

    log = createSessionLogger(authUser.userId, {
      route: '/api/parse-resume',
      userId: authUser.userId,
    });

    await applyRateLimit(authUser.userId, '/api/parse-resume', 'resume');

    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_PAYLOAD_SIZE) {
      throw new AppError(
        'Payload exceeds maximum allowed size of 5MB',
        413,
        'PAYLOAD_TOO_LARGE',
      );
    }

    const formData = await req.formData().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      throw new BadRequestError('Invalid form data submission', {
        details: msg,
      });
    });

    const file = formData.get('file');
    const result = await resumeParserService.parseResume(file);

    return ok(result);
  } catch (error) {
    return handleApiError(error, log);
  }
}
