import type { NextRequest } from 'next/server';

import {
  AppError,
  RateLimitError,
  UnauthorizedError,
} from '@/server/errors/AppError';
import { chatService } from '@/server/services/chat.service';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const authUser = await getAuthenticatedUser(req);

    await applyRateLimit(authUser.userId, '/api/interview/chat');

    return await chatService.handleChatStream(
      await req.json(),
      authUser.userId,
    );
  } catch (err) {
    if (err instanceof UnauthorizedError) {
      return new Response(
        JSON.stringify({ error: err.message, code: err.code }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (err instanceof RateLimitError) {
      return new Response(
        JSON.stringify({ error: err.message, code: err.code }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (err instanceof AppError) {
      return new Response(
        JSON.stringify({ error: err.message, code: err.code }),
        {
          status: err.statusCode,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const error = err instanceof Error ? err.message : 'Invalid request';
    return new Response(JSON.stringify({ error, code: 'BAD_REQUEST' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
