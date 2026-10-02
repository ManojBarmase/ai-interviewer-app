/**
 * Supabase Server Client
 *
 * Use this in:
 *   - Server Components (read-only, `setAll` omitted — see note below)
 *   - Route Handlers  (read + write, full `setAll` implementation)
 *   - Server Actions  (read + write, full `setAll` implementation)
 *   - Middleware      (use the separate middleware helper instead)
 *
 * ─── Why a new client per request? ──────────────────────────────────────────
 * The server client is NOT a singleton. A new instance must be created for
 * every request. Sharing one across requests leaks session state between users.
 *
 * ─── Cookie handling ─────────────────────────────────────────────────────────
 * `getAll` reads the incoming request cookies.
 * `setAll` writes refreshed tokens back to the response AND sets the required
 *  cache-control headers (private, no-store) so CDNs never cache auth cookies.
 *
 * In Server Components you cannot write response cookies directly (Next.js
 * restriction), so `setAll` is omitted there. The middleware MUST handle token
 * refreshes in that case. See `src/middleware.ts`.
 *
 * We use the non-deprecated `getAll`/`setAll` API — the older `get/set/remove`
 * pattern is explicitly avoided as it misses important edge-cases and will be
 * removed in a future major version of @supabase/ssr.
 *
 * ─── Security note ───────────────────────────────────────────────────────────
 * Always call `supabase.auth.getUser()` (not `getSession()`) when you need the
 * authenticated user server-side. `getUser()` re-validates the JWT against the
 * Supabase Auth server on every call, while `getSession()` trusts the cookie.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";

function getEnvVars() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local"
    );
  }

  return { supabaseUrl, supabaseAnonKey };
}

/**
 * Creates a Supabase client for use in **Server Components**.
 *
 * Cookie writing is intentionally omitted because Next.js does not allow
 * setting response cookies from Server Components. Your middleware must handle
 * token refreshes so that stale tokens are renewed before the component renders.
 *
 * @example
 * ```tsx
 * // app/dashboard/page.tsx  (Server Component)
 * import { createServerComponentClient } from "@/lib/supabase/server";
 *
 * export default async function DashboardPage() {
 *   const supabase = await createServerComponentClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) redirect("/login");
 *   ...
 * }
 * ```
 */
export async function createServerComponentClient(): Promise<SupabaseClient> {
  const { supabaseUrl, supabaseAnonKey } = getEnvVars();
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      // setAll intentionally omitted — Server Components cannot set response cookies.
      // Middleware is responsible for refreshing tokens.
    },
  });
}

/**
 * Creates a Supabase client for use in **Route Handlers** and **Server Actions**.
 *
 * Full `getAll`/`setAll` cookie support is provided so that token refreshes are
 * written back to the response. The `setAll` handler also applies the cache-
 * control headers required to prevent CDNs from caching auth responses.
 *
 * @example
 * ```ts
 * // app/api/profile/route.ts
 * import { createRouteHandlerClient } from "@/lib/supabase/server";
 * import { NextResponse } from "next/server";
 *
 * export async function GET() {
 *   const { supabase, response } = await createRouteHandlerClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   return NextResponse.json({ user }, { headers: response.headers });
 * }
 * ```
 */
export async function createRouteHandlerClient(): Promise<{
  supabase: SupabaseClient;
  response: Response;
}> {
  const { supabaseUrl, supabaseAnonKey } = getEnvVars();
  const cookieStore = await cookies();

  // A mutable response whose headers accumulate Set-Cookie and Cache-Control
  // headers written by the Supabase client during token refresh.
  const response = new Response();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet, cacheHeaders) {
        // Write refreshed auth cookies onto the response.
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options)
        );
        // Apply required cache-control headers (private, no-store, etc.) so
        // CDNs/reverse proxies never cache responses containing auth cookies.
        Object.entries(cacheHeaders).forEach(([key, value]) =>
          response.headers.set(key, value)
        );
      },
    },
  });

  return { supabase, response };
}
