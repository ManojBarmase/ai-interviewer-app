import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createServerClient } from '@supabase/ssr';

/**
 * Enterprise Entry Point (Root /)
 *
 * In an enterprise SaaS application, the root URL determines access:
 * - Authenticated users are directly routed to their active workspace (/dashboard).
 * - Unauthenticated users are routed to authentication (/login).
 *
 * The actual mock interview chamber is securely isolated at /interview
 * and requires role configuration via /dashboard/setup.
 */
export default async function HomePage() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isDemoSession =
    cookieStore.get('demo_candidate_session')?.value === 'true';

  if (user || isDemoSession) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
