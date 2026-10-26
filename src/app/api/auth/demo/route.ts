import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { env } from '@/lib/config/env';
import { DEMO_SESSION_COOKIE } from '@/lib/constants';

/**
 * Enterprise Demo Session Handler
 *
 * Provides instant 1-click access for reviewers, recruiters, and demo candidates
 * without relying on external SMTP email confirmation or hitting Supabase email rate limits.
 * Protected by feature flag and CSRF origin verification.
 */

export async function POST(request: NextRequest) {
  // 1. Verify demo mode is enabled
  if (env.DEMO_MODE_ENABLED === 'false') {
    return NextResponse.json(
      { error: 'Demo mode is not available', code: 'DEMO_DISABLED' },
      { status: 403, headers: { Vary: 'Cookie' } },
    );
  }

  // 2. CSRF-style Origin check
  const origin = request.headers.get('origin');
  if (origin) {
    const expectedOrigin = new URL(env.NEXT_PUBLIC_APP_URL).origin;
    const isDevLocal =
      env.NODE_ENV !== 'production' &&
      (origin === 'http://localhost:3000' ||
        origin === 'http://127.0.0.1:3000');
    if (
      !isDevLocal &&
      origin !== expectedOrigin &&
      origin !== env.NEXT_PUBLIC_APP_URL
    ) {
      return NextResponse.json(
        { error: 'Origin mismatch rejected', code: 'CSRF_REJECTED' },
        { status: 403, headers: { Vary: 'Cookie' } },
      );
    }
  }

  const cookieStore = await cookies();
  const createdAt = Date.now().toString();

  // 3. Set HttpOnly, secure session cookies with creation timestamp for server-side expiry
  cookieStore.set(DEMO_SESSION_COOKIE, 'true', {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  cookieStore.set('demo_session_created_at', createdAt, {
    path: '/',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return NextResponse.json(
    {
      success: true,
      message: 'Demo candidate session initialized successfully.',
    },
    {
      headers: {
        Vary: 'Cookie',
      },
    },
  );
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_SESSION_COOKIE);
  cookieStore.delete('demo_session_created_at');

  return NextResponse.json(
    { success: true, message: 'Demo session cleared.' },
    {
      headers: {
        Vary: 'Cookie',
      },
    },
  );
}
