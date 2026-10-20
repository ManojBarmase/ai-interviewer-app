import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

/**
 * Supabase Auth Callback Route Handler
 * Exchanges OAuth / Magic Link code for a session cookie with open-redirect protection.
 */
export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const rawNext =
    requestUrl.searchParams.get('next') ??
    requestUrl.searchParams.get('redirectTo') ??
    '/dashboard';

  // Enterprise Security: Prevent Open Redirect attacks.
  const next =
    rawNext.startsWith('/') && !rawNext.startsWith('//')
      ? rawNext
      : '/dashboard';

  if (code) {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(new URL(next, request.url));
    }
    console.error(
      '[AUTH_CALLBACK_ERROR] Failed to exchange code for session:',
      error.message,
    );
  }

  return NextResponse.redirect(
    new URL('/login?error=auth_callback_failed', request.url),
  );
}
