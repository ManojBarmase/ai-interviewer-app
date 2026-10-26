import 'server-only';

import { prisma, type Prisma } from '@/server/db/prisma';

export interface PaginationParams {
  page?: number; // 1-indexed, default 1
  pageSize?: number; // default 20, max 100
  cursor?: string; // UUID of last item for cursor pagination
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}

export type SessionWithRelations = Prisma.SessionGetPayload<{
  include: {
    scorecard: true;
    transcripts: {
      select: { id: true };
    };
  };
}>;

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
   * Finds active (non-deleted) sessions for a user with pagination.
   * Enforces max pageSize of 100, defaults to page 1 and pageSize 20.
   */
  async findManyByUserId(
    userId: string,
    pagination: PaginationParams = {},
  ): Promise<PaginatedResult<SessionWithRelations>> {
    const page = Math.max(1, pagination.page ?? 1);
    const rawPageSize = pagination.pageSize ?? 20;
    const pageSize = Math.max(1, Math.min(rawPageSize, 100));
    const skip = (page - 1) * pageSize;
    const take = Math.min(pageSize, 100);

    const where = {
      userId,
      isDeleted: false,
    };

    const [data, total] = await Promise.all([
      prisma.session.findMany({
        where,
        include: {
          scorecard: true,
          transcripts: {
            select: { id: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take,
        ...(pagination.cursor
          ? { cursor: { id: pagination.cursor }, skip: 1 }
          : { skip }),
      }),
      prisma.session.count({
        where,
      }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  },
};
