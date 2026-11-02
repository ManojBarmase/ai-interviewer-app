import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

import type { EmailOtpType } from '@supabase/supabase-js';

/**
 * Supabase Auth Callback Route Handler
 * Exchanges PKCE authorization code or OTP token_hash for a session cookie
 * with enterprise open-redirect protection and descriptive error handling.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const token_hash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type') as EmailOtpType | null;
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  const rawNext =
    requestUrl.searchParams.get('next') ??
    requestUrl.searchParams.get('redirectTo') ??
    '/dashboard';

  // Enterprise Security: Prevent Open Redirect attacks.
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/dashboard';

  // 1. Handle error reported directly by Supabase Auth service
  if (error) {
    const errorMsg = errorDescription || error;
    console.error('[AUTH_CALLBACK_ERROR] Supabase auth error:', errorMsg);
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', errorMsg);
    return NextResponse.redirect(loginUrl);
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );

  // 2. Handle OTP Token Hash Flow (e.g. email verification link with token_hash)
  if (token_hash && type) {
    const { error: otpError } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    });

    if (!otpError) {
      const destination = new URL(next, request.url);
      destination.searchParams.set('verified', 'true');
      return NextResponse.redirect(destination);
    }

    console.error(
      '[AUTH_CALLBACK_ERROR] Failed to verify OTP token_hash:',
      otpError.message,
    );
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', otpError.message);
    return NextResponse.redirect(loginUrl);
  }

  // 3. Handle PKCE Code Exchange Flow (e.g. code query param)
  if (code) {
    const { error: codeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (!codeError) {
      const destination = new URL(next, request.url);
      destination.searchParams.set('verified', 'true');
      return NextResponse.redirect(destination);
    }

    console.error(
      '[AUTH_CALLBACK_ERROR] Failed to exchange code for session:',
      codeError.message,
    );
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('error', codeError.message);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Fallback if callback invoked without valid parameters
  return NextResponse.redirect(
    new URL('/login?error=auth_callback_failed', request.url),
  );
}
