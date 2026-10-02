"use client";

/**
 * Supabase Browser Client
 *
 * Use this in Client Components ("use client") that need to call Supabase.
 *
 * Key design decisions:
 * - `createBrowserClient` automatically persists the session in cookies so
 *   that server-side renders can read it without any extra configuration.
 * - `isSingleton: true` (default) ensures a single client instance is reused
 *   across React re-renders — safe for the browser, avoids connection churn.
 * - We deliberately do NOT pass a custom `cookies` option because the library
 *   falls back to `document.cookie` automatically in a browser context. The
 *   deprecated `get/set/remove` pattern is intentionally avoided.
 * - Do NOT use this file in Server Components, Route Handlers, or middleware —
 *   use `@/lib/supabase/server` instead.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns a Supabase client for use in browser (Client Component) code.
 *
 * @example
 * ```tsx
 * "use client";
 * import { createClient } from "@/lib/supabase/client";
 *
 * export function SignOutButton() {
 *   const supabase = createClient();
 *   return <button onClick={() => supabase.auth.signOut()}>Sign out</button>;
 * }
 * ```
 */
export function createClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "Missing Supabase environment variables: " +
        "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set in .env.local"
    );
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
