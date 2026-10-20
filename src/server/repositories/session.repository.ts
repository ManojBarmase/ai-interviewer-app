import 'server-only';

import { prisma } from '@/server/db/prisma';

export const sessionRepository = {
  /**
   * Soft deletes a session belonging to a specific user.
   */
  async softDelete(id: string, userId: string) {
    return prisma.session.update({
      where: {
        id,
        userId,
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
      },
    });
  },

  /**
   * Finds a session by id and optional owner userId.
   */
  async findById(id: string, userId?: string) {
    return prisma.session.findFirst({
      where: {
        id,
        ...(userId ? { userId } : {}),
        isDeleted: false,
      },
      include: {
        scorecard: true,
        transcripts: true,
      },
    });
  },

  /**
   * Finds all active (non-deleted) sessions for a user.
   */
  async findManyByUserId(userId: string) {
    return prisma.session.findMany({
      where: {
        userId,
        isDeleted: false,
      },
      include: {
        scorecard: true,
        transcripts: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  },
};
