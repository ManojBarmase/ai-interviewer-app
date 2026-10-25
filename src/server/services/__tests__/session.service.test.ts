import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BadRequestError, NotFoundError } from '@/server/errors/AppError';
import { sessionRepository } from '@/server/repositories/session.repository';
import {
  SessionService,
  sessionService,
} from '@/server/services/session.service';

vi.mock('@/server/repositories/session.repository', () => ({
  sessionRepository: {
    softDelete: vi.fn(),
    findById: vi.fn(),
    findManyByUserId: vi.fn(),
  },
}));

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SessionService();
  });

  describe('deleteSession', () => {
    it('throws BadRequestError when sessionId is empty string', async () => {
      await expect(service.deleteSession('', 'user-123')).rejects.toThrow(
        BadRequestError,
      );
      await expect(service.deleteSession('   ', 'user-123')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws BadRequestError when userId is empty string', async () => {
      await expect(service.deleteSession('session-123', '')).rejects.toThrow(
        BadRequestError,
      );
      await expect(service.deleteSession('session-123', '   ')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('throws NotFoundError when repository throws Prisma error with code P2025', async () => {
      vi.mocked(sessionRepository.softDelete).mockRejectedValueOnce({
        code: 'P2025',
        message: 'Record to update not found.',
      });

      await expect(
        service.deleteSession('session-missing', 'user-123'),
      ).rejects.toThrow(NotFoundError);
    });

    it('re-throws unknown errors as-is', async () => {
      const customDbError = new Error('Database cluster is unreachable');
      vi.mocked(sessionRepository.softDelete).mockRejectedValueOnce(
        customDbError,
      );

      await expect(
        service.deleteSession('session-123', 'user-123'),
      ).rejects.toThrow('Database cluster is unreachable');
    });

    it('returns deleted session on success and calls sessionRepository.softDelete with correct arguments', async () => {
      const mockDeleted = {
        id: 'session-123',
        userId: 'user-123',
        isDeleted: true,
        deletedAt: new Date(),
        role: 'Frontend Engineer',
        interviewType: 'TECHNICAL',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(sessionRepository.softDelete).mockResolvedValueOnce(
        mockDeleted as never,
      );

      const result = await service.deleteSession('session-123', 'user-123');

      expect(sessionRepository.softDelete).toHaveBeenCalledTimes(1);
      expect(sessionRepository.softDelete).toHaveBeenCalledWith(
        'session-123',
        'user-123',
      );
      expect(result).toEqual(mockDeleted);
    });
  });

  describe('getUserSessions', () => {
    it('throws BadRequestError when userId is empty string', async () => {
      await expect(service.getUserSessions('')).rejects.toThrow(
        BadRequestError,
      );
      await expect(service.getUserSessions('   ')).rejects.toThrow(
        BadRequestError,
      );
    });

    it('calls sessionRepository.findManyByUserId with correct userId and returns repository result', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          userId: 'user-456',
          role: 'Full Stack Engineer',
          scorecard: null,
          transcripts: [{ id: 'tr-1' }],
        },
        {
          id: 'session-2',
          userId: 'user-456',
          role: 'Backend Engineer',
          scorecard: { overallScore: 8.5 },
          transcripts: [{ id: 'tr-2' }],
        },
      ];

      vi.mocked(sessionRepository.findManyByUserId).mockResolvedValueOnce(
        mockSessions as never,
      );

      const result = await service.getUserSessions('user-456');

      expect(sessionRepository.findManyByUserId).toHaveBeenCalledTimes(1);
      expect(sessionRepository.findManyByUserId).toHaveBeenCalledWith(
        'user-456',
      );
      expect(result).toEqual(mockSessions);
    });

    it('verifies default singleton export exists', () => {
      expect(sessionService).toBeInstanceOf(SessionService);
    });
  });
});
