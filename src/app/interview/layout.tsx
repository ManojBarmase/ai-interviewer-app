import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createServerClient } from '@supabase/ssr';

import { DEMO_SESSION_COOKIE } from '@/lib/constants';

/**
 * Enterprise Route Protection for /interview Layout
 *
 * Provides defense-in-depth verification before any hardware or WebRTC
 * components are initialized. Redirects unauthenticated visitors to /login.
 */
export default async function InterviewLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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

  const isDemoSession = cookieStore.get(DEMO_SESSION_COOKIE)?.value === 'true';

  if (!user && !isDemoSession) {
    redirect('/login?redirectTo=/interview');
  }

  return children;
}
