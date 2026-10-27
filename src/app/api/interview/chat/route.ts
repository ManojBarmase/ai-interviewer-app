import type { NextRequest } from 'next/server';

import { createSessionLogger } from '@/lib/logger';
import { chatService } from '@/server/services/chat.service';
import { handleApiError } from '@/server/utils/api-response';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  let log = createSessionLogger('chat', { route: '/api/interview/chat' });

  try {
    const authUser = await getAuthenticatedUser(req);
    const body = await req.json().catch(() => null);

    log = createSessionLogger(body?.sessionId, {
      route: '/api/interview/chat',
      userId: authUser.userId,
    });

    await applyRateLimit(authUser.userId, '/api/interview/chat', 'chat');

    return await chatService.handleChatStream(body, authUser.userId);
  } catch (err) {
    return handleApiError(err, log);
  }
}
