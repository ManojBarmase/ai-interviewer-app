import { describe, it, expect, vi, beforeEach } from 'vitest';

import { prisma } from '@/server/db/prisma';
import { sessionRepository } from '@/server/repositories/session.repository';

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    session: {
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('sessionRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('softDelete', () => {
    it('updates session with isDeleted true and deletedAt timestamp', async () => {
      const mockResult = { id: 's-1', userId: 'u-1', isDeleted: true };
      vi.mocked(prisma.session.update).mockResolvedValueOnce(
        mockResult as never,
      );

      const result = await sessionRepository.softDelete('s-1', 'u-1');

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 's-1', userId: 'u-1' },
        data: {
          isDeleted: true,
          deletedAt: expect.any(Date),
        },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findById', () => {
    it('finds non-deleted session by id and userId', async () => {
      const mockResult = { id: 's-1', userId: 'u-1' };
      vi.mocked(prisma.session.findFirst).mockResolvedValueOnce(
        mockResult as never,
      );

      const result = await sessionRepository.findById('s-1', 'u-1');

      expect(prisma.session.findFirst).toHaveBeenCalledWith({
        where: { id: 's-1', userId: 'u-1', isDeleted: false },
        include: { scorecard: true, transcripts: true },
      });
      expect(result).toEqual(mockResult);
    });
  });

  describe('findManyByUserId with Pagination', () => {
    it('uses default pagination (page=1, pageSize=20) and computes metadata', async () => {
      const mockData = [{ id: 's-1' }, { id: 's-2' }];
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce(
        mockData as never,
      );
      vi.mocked(prisma.session.count).mockResolvedValueOnce(45);

      const result = await sessionRepository.findManyByUserId('user-1');

      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDeleted: false },
        include: {
          scorecard: true,
          transcripts: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        skip: 0,
      });
      expect(prisma.session.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDeleted: false },
      });
      expect(result).toEqual({
        data: mockData,
        total: 45,
        page: 1,
        pageSize: 20,
        totalPages: 3,
        hasNextPage: true,
        hasPreviousPage: false,
      });
    });

    it('clamps pageSize to a maximum of 100', async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.session.count).mockResolvedValueOnce(150);

      const result = await sessionRepository.findManyByUserId('user-1', {
        page: 2,
        pageSize: 500, // Exceeds max 100
      });

      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDeleted: false },
        include: {
          scorecard: true,
          transcripts: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
        skip: 100, // (2 - 1) * 100
      });
      expect(result.pageSize).toBe(100);
      expect(result.page).toBe(2);
      expect(result.totalPages).toBe(2);
      expect(result.hasNextPage).toBe(false);
      expect(result.hasPreviousPage).toBe(true);
    });

    it('supports cursor pagination if provided', async () => {
      vi.mocked(prisma.session.findMany).mockResolvedValueOnce([]);
      vi.mocked(prisma.session.count).mockResolvedValueOnce(10);

      await sessionRepository.findManyByUserId('user-1', {
        cursor: 's-prev-uuid',
        pageSize: 10,
      });

      expect(prisma.session.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDeleted: false },
        include: {
          scorecard: true,
          transcripts: { select: { id: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        cursor: { id: 's-prev-uuid' },
        skip: 1,
      });
    });
  });
});
