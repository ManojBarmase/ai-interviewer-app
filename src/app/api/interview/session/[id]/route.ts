import { type NextRequest } from 'next/server';

import { NotFoundError } from '@/server/errors/AppError';
import { sessionRepository } from '@/server/repositories/session.repository';
import { sessionService } from '@/server/services/session.service';
import { handleApiError, ok } from '@/server/utils/api-response';
import {
  getAuthenticatedUser,
  requireOwnership,
} from '@/server/utils/auth-guard';

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const authUser = await getAuthenticatedUser(req);

    const session = await sessionRepository.findById(id);
    if (!session) {
      throw new NotFoundError('Session not found or already deleted.');
    }

    requireOwnership(session.userId, authUser.userId, authUser.role);

    await sessionService.deleteSession(id, session.userId);
    return ok({ success: true });
  } catch (error) {
    return handleApiError(error, { route: '/api/interview/session/[id]' });
  }
}
