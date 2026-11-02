import 'server-only';

import { cache } from 'react';

import { cookies } from 'next/headers';

import { createServerClient } from '@supabase/ssr';

import {
  DEMO_SESSION_COOKIE,
  DEMO_USER_ID,
  DEMO_USER_EMAIL,
} from '@/lib/constants';

export interface CurrentAuthUser {
  id: string;
  email: string;
  name: string;
  isDemo: boolean;
}

/**
 * Enterprise Request-Scoped User Authentication Resolver.
 *
 * Wrapped in React `cache()` to deduplicate authentication queries across
 * Layouts, Server Components, and Page components within the same request lifecycle.
 * Prevents redundant HTTP roundtrips to Supabase Auth.
 */
export const getCurrentUser = cache(
  async (): Promise<CurrentAuthUser | null> => {
    const cookieStore = await cookies();

    // 1. Fast path for demo candidate sessions (<1ms)
    const isDemoSession =
      cookieStore.get(DEMO_SESSION_COOKIE)?.value === 'true';
    if (isDemoSession) {
      return {
        id: DEMO_USER_ID,
        email: DEMO_USER_EMAIL,
        name: 'Demo Candidate',
        isDemo: true,
      };
    }

    // 2. Quick pre-check: if no Supabase session token cookie exists, return null immediately
    const allCookies = cookieStore.getAll();
    const hasSupabaseCookie = allCookies.some(
      (c) =>
        (c.name.startsWith('sb-') && c.name.includes('-auth-token')) ||
        c.name === 'sb-access-token' ||
        c.name.startsWith('sb-'),
    );

    if (!hasSupabaseCookie) {
      return null;
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

    if (!supabaseUrl || !supabaseKey) {
      return null;
    }

    try {
      const supabase = createServerClient(supabaseUrl, supabaseKey, {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
        },
      });

      // Defensive timeout: prevent 30s hangs if external identity provider is slow/paused
      const timeoutPromise = new Promise<{
        data: { user: null };
        error: Error;
      }>((_, reject) =>
        setTimeout(
          () => reject(new Error('Supabase Auth verification timeout')),
          2500,
        ),
      );

      const result = await Promise.race([
        supabase.auth.getUser(),
        timeoutPromise,
      ]);

      const authUser = result.data.user;
      if (!authUser) {
        return null;
      }

      return {
        id: authUser.id,
        email: authUser.email || 'candidate@example.com',
        name:
          authUser.user_metadata?.name ||
          authUser.user_metadata?.first_name ||
          authUser.email?.split('@')[0] ||
          'Candidate',
        isDemo: false,
      };
    } catch {
      return null;
    }
  },
);
