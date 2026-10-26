import 'server-only';

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

import { env } from '@/lib/config/env';
import {
  DEMO_SESSION_COOKIE,
  DEMO_USER_EMAIL,
  DEMO_USER_ID,
} from '@/lib/constants';
import { prisma } from '@/server/db/prisma';
import { ForbiddenError, UnauthorizedError } from '@/server/errors/AppError';

export type UserRole = 'CANDIDATE' | 'INTERVIEWER' | 'ADMIN' | 'DEMO';

export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  isDemo: boolean;
  email?: string | null | undefined;
  firstName?: string | null | undefined;
}

/**
 * Authenticates the incoming request via Supabase session cookie or demo session cookie.
 * Throws UnauthorizedError if unauthenticated.
 */
export async function getAuthenticatedUser(
  req: NextRequest,
): Promise<AuthenticatedUser> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let isDemo = req.cookies.get(DEMO_SESSION_COOKIE)?.value === 'true';
  if (!isDemo) {
    try {
      const cookieStore = await cookies();
      isDemo = cookieStore.get(DEMO_SESSION_COOKIE)?.value === 'true';
    } catch {
      // In isolated test runner or contexts without AsyncLocalStorage, ignore
    }
  }

  if (isDemo) {
    return {
      userId: DEMO_USER_ID,
      role: 'CANDIDATE',
      isDemo: true,
      email: DEMO_USER_EMAIL,
      firstName: 'Demo Candidate',
    };
  }

  const supabase =
    url && key
      ? createServerClient(url, key, {
          cookies: {
            getAll: () => req.cookies.getAll(),
            setAll: (cookiesToSet) => {
              try {
                cookies()
                  .then((store) => {
                    cookiesToSet.forEach(({ name, value, options }) => {
                      store.set(name, value, options);
                    });
                  })
                  .catch(() => {});
              } catch {
                // Ignore if in streaming / read-only context
              }
            },
          },
        })
      : null;

  let authUser = null;
  if (supabase) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data?.user) {
        authUser = data.user;
      }
    } catch {
      authUser = null;
    }
  }

  if (!authUser) {
    throw new UnauthorizedError(
      'Unauthorized. Authentication required to access this endpoint.',
    );
  }

  // Real authenticated user
  const userId = authUser.id;
  let role: UserRole = 'CANDIDATE';

  try {
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (dbUser?.role) {
      role = dbUser.role as UserRole;
    }
  } catch {
    role = 'CANDIDATE';
  }

  return {
    userId,
    role,
    isDemo: false,
    email: authUser.email ?? null,
    firstName:
      authUser.user_metadata?.first_name ??
      authUser.user_metadata?.name ??
      null,
  };
}

/**
 * Enforces role-based access control.
 * Throws ForbiddenError if user's role is not within allowedRoles.
 */
export function requireRole(userRole: string, ...allowedRoles: string[]): void {
  if (!allowedRoles.includes(userRole)) {
    throw new ForbiddenError(
      `Access denied. Role '${userRole}' is not authorized to perform this action.`,
    );
  }
}

/**
 * Ensures a user can only access their own data, unless they possess ADMIN role.
 * Throws ForbiddenError if resource owner does not match authenticated user and user is not ADMIN.
 */
export function requireOwnership(
  resourceUserId: string,
  authUserId: string,
  adminRole?: string,
): void {
  if (resourceUserId !== authUserId && adminRole !== 'ADMIN') {
    throw new ForbiddenError(
      'Access denied. You do not have permission to access this resource.',
    );
  }
}
