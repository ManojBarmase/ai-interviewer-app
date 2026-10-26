import type { NextRequest } from 'next/server';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { DELETE } from '@/app/api/interview/session/[id]/route';
import { ForbiddenError, UnauthorizedError } from '@/server/errors/AppError';
import { sessionRepository } from '@/server/repositories/session.repository';
import { sessionService } from '@/server/services/session.service';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

vi.mock('@/server/utils/auth-guard', () => ({
  getAuthenticatedUser: vi.fn(),
  requireOwnership: (
    resourceUserId: string,
    authUserId: string,
    adminRole?: string,
  ) => {
    if (resourceUserId !== authUserId && adminRole !== 'ADMIN') {
      throw new ForbiddenError(
        'Access denied. You do not have permission to access this resource.',
      );
    }
  },
  requireRole: vi.fn(),
}));

vi.mock('@/server/repositories/session.repository', () => ({
  sessionRepository: {
    findById: vi.fn(),
    softDelete: vi.fn(),
  },
}));

vi.mock('@/server/services/session.service', () => ({
  sessionService: {
    deleteSession: vi.fn(),
  },
}));

function createMockRequest(): NextRequest {
  return {} as NextRequest;
}

describe('DELETE /api/interview/session/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when request is unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValueOnce(
      new UnauthorizedError('Unauthorized. Please sign in.'),
    );

    const res = await DELETE(createMockRequest(), {
      params: Promise.resolve({ id: 's-1' }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
  });

  it('returns 404 when session does not exist', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(sessionRepository.findById).mockResolvedValueOnce(null);

    const res = await DELETE(createMockRequest(), {
      params: Promise.resolve({ id: 's-missing' }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe('NOT_FOUND');
  });

  it('returns 403 when session belongs to another user and caller is not ADMIN', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(sessionRepository.findById).mockResolvedValueOnce({
      id: 's-1',
      userId: 'user-2', // belongs to another user
      isDeleted: false,
    } as never);

    const res = await DELETE(createMockRequest(), {
      params: Promise.resolve({ id: 's-1' }),
    });

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe('FORBIDDEN');
    expect(sessionService.deleteSession).not.toHaveBeenCalled();
  });

  it('successfully deletes session when caller is the owner', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(sessionRepository.findById).mockResolvedValueOnce({
      id: 's-1',
      userId: 'user-1',
      isDeleted: false,
    } as never);
    vi.mocked(sessionService.deleteSession).mockResolvedValueOnce({} as never);

    const res = await DELETE(createMockRequest(), {
      params: Promise.resolve({ id: 's-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(sessionService.deleteSession).toHaveBeenCalledWith('s-1', 'user-1');
  });

  it('successfully deletes session when caller has ADMIN role even if owned by another', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'admin-user',
      role: 'ADMIN',
      isDemo: false,
    });
    vi.mocked(sessionRepository.findById).mockResolvedValueOnce({
      id: 's-1',
      userId: 'candidate-user',
      isDeleted: false,
    } as never);
    vi.mocked(sessionService.deleteSession).mockResolvedValueOnce({} as never);

    const res = await DELETE(createMockRequest(), {
      params: Promise.resolve({ id: 's-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ success: true });
    expect(sessionService.deleteSession).toHaveBeenCalledWith(
      's-1',
      'candidate-user',
    );
  });
});
