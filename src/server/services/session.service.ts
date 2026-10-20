import 'server-only';

import { createSessionLogger } from '@/lib/logger';
import { BadRequestError, NotFoundError } from '@/server/errors/AppError';
import { sessionRepository } from '@/server/repositories/session.repository';

export class SessionService {
  /**
   * Soft deletes a session with parameter validation, ownership verification,
   * and structured telemetry.
   */
  async deleteSession(sessionId: string, userId: string) {
    if (!sessionId || !sessionId.trim()) {
      throw new BadRequestError('Session ID is required.');
    }
    if (!userId || !userId.trim()) {
      throw new BadRequestError('User ID is required.');
    }

    const logger = createSessionLogger(sessionId, {
      service: 'SessionService',
      userId,
    });

    try {
      const deleted = await sessionRepository.softDelete(sessionId, userId);
      logger.info({ sessionId }, 'Session soft deleted successfully');
      return deleted;
    } catch (err: unknown) {
      logger.error({ err, sessionId }, 'Failed to soft delete session');
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        (err as { code: string }).code === 'P2025'
      ) {
        throw new NotFoundError('Session not found or already deleted.');
      }
      throw err;
    }
  }

  /**
   * Retrieves all non-deleted sessions for a given user.
   */
  async getUserSessions(userId: string) {
    if (!userId || !userId.trim()) {
      throw new BadRequestError('User ID is required.');
    }
    return sessionRepository.findManyByUserId(userId);
  }
}

export const sessionService = new SessionService();
