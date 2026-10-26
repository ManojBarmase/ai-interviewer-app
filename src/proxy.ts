/**
 * Supabase Auth Proxy (Route Protection)
 *
 * --- Next.js 16 Breaking Changes --------------------------------------------
 * • File renamed: middleware.ts  →  proxy.ts   (this file)
 * • Export renamed: `middleware` →  `proxy`
 * • Runtime: Edge runtime removed in v16. Proxy now always runs on Node.js.
 *   Setting `export const runtime = "edge"` will throw a build error — omitted.
 * • docs: node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
 *
 * --- What this proxy does ----------------------------------------------------
 * 1. Refreshes the Supabase session on every matched request so Server
 *    Components always receive a fresh, valid session cookie.
 * 2. Redirects unauthenticated users away from protected routes.
 *
 * --- Protected routes --------------------------------------------------------
 * • /dashboard/**  — authenticated UI
 * • /api/interview/** — interview API endpoints
 *
 * --- Security architecture note ----------------------------------------------
 * This proxy is a FIRST LINE of defence — fast, low-cost. It does NOT replace
 * per-route or per-server-function auth checks. Always call `getUser()` in
 * Route Handlers and Server Actions as well. See proxy.md §251:
 *   "Always verify authentication and authorization inside each Server Function
 *    rather than relying on Proxy alone."
 *
 * --- Cookie handling ---------------------------------------------------------
 * We use the non-deprecated `getAll`/`setAll` cookie API from @supabase/ssr.
 * `setAll` writes refreshed auth tokens AND applies cache-control headers
 * (private, no-store) so CDNs/reverse proxies never cache auth responses.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { createServerClient } from '@supabase/ssr';

import { env } from '@/lib/config/env';
import { DEMO_SESSION_COOKIE, DEMO_USER_ID } from '@/lib/constants';

export { DEMO_USER_ID };

/** 24-hour expiration duration in milliseconds for demo candidate sessions */
const DEMO_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/interview',
  '/api/interview',
] as const;

/** The page users are redirected to when unauthenticated. */
const LOGIN_PATH = '/login';

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  // Health check endpoint requires no auth and should bypass proxy logic immediately
  if (pathname === '/api/health') {
    return NextResponse.next();
  }

  // -- 1. Build a mutable response that we will return. -----------------------
  // We start with NextResponse.next() so the request continues normally unless
  // we decide to redirect. Cookie writes are attached to this response.
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // -- 2. Create the Supabase server client. ----------------------------------
  // A new client MUST be created per request — never reuse across requests.
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      /**
       * Read auth cookies from the incoming request.
       * NextRequest.cookies.getAll() returns { name, value }[] which matches
       * the shape expected by @supabase/ssr's GetAllCookies type.
       */
      getAll() {
        return request.cookies.getAll();
      },

      /**
       * Write refreshed auth tokens back to BOTH the outgoing request (so
       * Server Components in this render see the new tokens) and the response
       * (so the browser stores them for the next request).
       *
       * The `cacheHeaders` object contains Cache-Control, Expires, and Pragma
       * headers that must be set to prevent CDNs from caching auth responses.
       */
      setAll(cookiesToSet, cacheHeaders) {
        // Mirror cookies onto the request so upstream Server Components see
        // the refreshed session without a round-trip.
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );

        // Rebuild the response with the updated request headers.
        response = NextResponse.next({
          request: { headers: request.headers },
        });

        // Write the refreshed cookies onto the response sent to the browser.
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );

        // Apply cache-control headers so CDNs never cache auth cookies.
        Object.entries(cacheHeaders).forEach(([key, value]) =>
          response.headers.set(key, value),
        );
      },
    },
  });

  // -- 3. Refresh the session. ------------------------------------------------
  // IMPORTANT: Always call getUser() (not getSession()) in the proxy.
  // getUser() re-validates the JWT against the Supabase Auth server — it cannot
  // be spoofed by a tampered cookie. getSession() trusts the cookie blindly.
  //
  // Call this BEFORE any response is generated so token refreshes can be
  // written to cookies. If a token refresh completes after the response is
  // committed, the updated session is lost and the next request re-refreshes.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const demoCookie = request.cookies.get(DEMO_SESSION_COOKIE)?.value;
  const demoCreatedAt = request.cookies.get('demo_session_created_at')?.value;

  let isDemoSession = false;
  if (demoCookie === 'true') {
    const createdAtMs = demoCreatedAt ? parseInt(demoCreatedAt, 10) : NaN;
    // Session is only expired if a valid timestamp exists and is older than max age
    const isExpired =
      Boolean(createdAtMs) &&
      Date.now() - createdAtMs > DEMO_SESSION_MAX_AGE_MS;

    if (isExpired) {
      isDemoSession = false;
      response.cookies.delete(DEMO_SESSION_COOKIE);
      response.cookies.delete('demo_session_created_at');
    } else {
      isDemoSession = true;
      // Self-heal: if timestamp cookie is missing, set it now with 24h lifetime
      if (!createdAtMs) {
        response.cookies.set('demo_session_created_at', Date.now().toString(), {
          path: '/',
          httpOnly: true,
          secure: env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 60 * 60 * 24,
        });
      }
    }
  }

  const isAuthenticated = !!user || isDemoSession;

  // -- 4. Enforce route protection. -------------------------------------------
  // If an already-authenticated user visits the login page, redirect them to dashboard
  if (pathname === LOGIN_PATH && isAuthenticated) {
    const rawRedirect = request.nextUrl.searchParams.get('redirectTo');
    const safeTarget =
      rawRedirect &&
      rawRedirect.startsWith('/') &&
      !rawRedirect.startsWith('//')
        ? rawRedirect
        : '/dashboard';
    return NextResponse.redirect(new URL(safeTarget, request.url));
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (isProtected && !isAuthenticated) {
    // Enterprise Standard: API requests must return 401 JSON instead of an HTML redirect
    if (pathname.startsWith('/api/')) {
      const apiResponse = NextResponse.json(
        {
          error:
            'Unauthorized. Authentication required to access this endpoint.',
        },
        { status: 401 },
      );
      if (demoCookie === 'true' && !isDemoSession) {
        apiResponse.cookies.delete(DEMO_SESSION_COOKIE);
        apiResponse.cookies.delete('demo_session_created_at');
      }
      return apiResponse;
    }

    // Preserve the originally requested URL as a `redirectTo` query param so
    // the login page can redirect back after a successful sign-in.
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set('redirectTo', pathname);
    const redirectResponse = NextResponse.redirect(loginUrl);
    if (demoCookie === 'true' && !isDemoSession) {
      redirectResponse.cookies.delete(DEMO_SESSION_COOKIE);
      redirectResponse.cookies.delete('demo_session_created_at');
    }
    return redirectResponse;
  }

  // -- 5. Return the (possibly cookie-updated) response. ---------------------
  return response;
}

/**
 * Matcher — the set of paths this proxy runs on.
 *
 * We explicitly include:
 *   • /dashboard and all sub-paths
 *   • /api/interview and all sub-paths
 *   • /login (to redirect already-logged-in users)
 *
 * We exclude static assets (_next/static, _next/image, public files) to avoid
 * running Supabase auth logic on every image or CSS request.
 *
 * matcher values must be string literals (statically analysable at build time).
 */
export const config = {
  matcher: [
    '/dashboard',
    '/dashboard/:path*',
    '/interview',
    '/interview/:path*',
    '/api/interview/:path*',
    '/login',
  ],
};
