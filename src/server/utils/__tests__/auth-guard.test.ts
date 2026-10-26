import type { NextRequest } from 'next/server';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import {
  DEMO_SESSION_COOKIE,
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
} from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { ForbiddenError, UnauthorizedError } from '@/server/errors/AppError';
import {
  getAuthenticatedUser,
  requireRole,
  requireOwnership,
} from '@/server/utils/auth-guard';

const mockGetUser = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@/server/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/config/env', () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
  },
}));

function createMockRequest(cookies: Record<string, string> = {}): NextRequest {
  return {
    cookies: {
      getAll: () =>
        Object.entries(cookies).map(([name, value]) => ({ name, value })),
      get: (name: string) =>
        cookies[name] !== undefined
          ? { name, value: cookies[name] }
          : undefined,
    },
  } as unknown as NextRequest;
}

describe('auth-guard utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getAuthenticatedUser', () => {
    it('throws UnauthorizedError when no Supabase user and no demo cookie exist', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: null });
      const req = createMockRequest();

      await expect(getAuthenticatedUser(req)).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('returns synthetic candidate when demo session cookie is set to true', async () => {
      const req = createMockRequest({ [DEMO_SESSION_COOKIE]: 'true' });

      const authUser = await getAuthenticatedUser(req);
      expect(authUser).toEqual({
        userId: DEMO_USER_ID,
        role: 'CANDIDATE',
        isDemo: true,
        email: DEMO_USER_EMAIL,
        firstName: 'Demo Candidate',
      });
    });

    it('returns real user with default role CANDIDATE if user record not found in DB', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'real-user-123',
            email: 'user@example.com',
            user_metadata: { first_name: 'Alice' },
          },
        },
        error: null,
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(null);

      const req = createMockRequest();
      const authUser = await getAuthenticatedUser(req);

      expect(authUser).toEqual({
        userId: 'real-user-123',
        role: 'CANDIDATE',
        isDemo: false,
        email: 'user@example.com',
        firstName: 'Alice',
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'real-user-123' },
        select: { role: true },
      });
    });

    it('returns real user with custom role from DB (e.g. ADMIN)', async () => {
      mockGetUser.mockResolvedValueOnce({
        data: {
          user: {
            id: 'admin-user-456',
            email: 'admin@company.com',
            user_metadata: {},
          },
        },
        error: null,
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        role: 'ADMIN',
      } as never);

      const req = createMockRequest();
      const authUser = await getAuthenticatedUser(req);

      expect(authUser).toEqual({
        userId: 'admin-user-456',
        role: 'ADMIN',
        isDemo: false,
        email: 'admin@company.com',
        firstName: null,
      });
    });
  });

  describe('requireRole', () => {
    it('throws ForbiddenError when user role is not in allowed roles', () => {
      expect(() => requireRole('CANDIDATE', 'ADMIN', 'INTERVIEWER')).toThrow(
        ForbiddenError,
      );
    });

    it('does not throw when user role is within allowed roles', () => {
      expect(() => requireRole('ADMIN', 'ADMIN', 'INTERVIEWER')).not.toThrow();
      expect(() => requireRole('CANDIDATE', 'CANDIDATE')).not.toThrow();
    });
  });

  describe('requireOwnership', () => {
    it('does not throw when resource owner matches authUserId', () => {
      expect(() =>
        requireOwnership('user-100', 'user-100', 'CANDIDATE'),
      ).not.toThrow();
    });

    it('does not throw when user is ADMIN even if IDs differ', () => {
      expect(() =>
        requireOwnership('user-100', 'admin-999', 'ADMIN'),
      ).not.toThrow();
    });

    it('throws ForbiddenError when user is not owner and not ADMIN', () => {
      expect(() =>
        requireOwnership('user-100', 'other-user', 'CANDIDATE'),
      ).toThrow(ForbiddenError);
    });
  });
});
