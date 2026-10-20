import type { NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

import { rateLimit } from '@/server/integrations/cache/ratelimit';
import { chatService } from '@/server/services/chat.service';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest): Promise<Response> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase =
    url && key
      ? createServerClient(url, key, {
          cookies: { getAll: () => req.cookies.getAll() },
        })
      : null;
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  const isDemo = req.cookies.get('demo_candidate_session')?.value === 'true';
  const userId =
    user?.id ?? (isDemo ? '00000000-0000-0000-0000-000000000000' : null);

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', code: 'UNAUTHORIZED' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } },
    );
  }

  try {
    const { success } = await rateLimit.limit(userId);
    if (!success) {
      return new Response(
        JSON.stringify({ error: 'Rate limited', code: 'RATE_LIMITED' }),
        { status: 429, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } catch {
    // Continue if redis is unavailable
  }

  try {
    return await chatService.handleChatStream(await req.json(), userId);
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Invalid request';
    return new Response(JSON.stringify({ error, code: 'BAD_REQUEST' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
