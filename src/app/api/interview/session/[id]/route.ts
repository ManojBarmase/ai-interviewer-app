import { cookies } from 'next/headers';

import { createRouteHandlerClient } from '@/lib/supabase/server';
import { UnauthorizedError } from '@/server/errors/AppError';
import { sessionService } from '@/server/services/session.service';
import { handleApiError, ok } from '@/server/utils/api-response';

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const { supabase } = await createRouteHandlerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const hasDemo = cookieStore.get('demo_candidate_session')?.value === 'true';
    const userId =
      user?.id ?? (hasDemo ? '00000000-0000-0000-0000-000000000000' : null);

    if (!userId) {
      throw new UnauthorizedError(
        'Unauthorized. Please sign in to perform this action.',
      );
    }

    await sessionService.deleteSession(id, userId);
    return ok({ success: true });
  } catch (error) {
    return handleApiError(error, { route: '/api/interview/session/[id]' });
  }
}
