import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/get-current-user';

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
interface HomePageProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function HomePage({ searchParams }: HomePageProps = {}) {
  const params = searchParams ? await searchParams : {};
  const code = typeof params.code === 'string' ? params.code : undefined;
  const token_hash =
    typeof params.token_hash === 'string' ? params.token_hash : undefined;
  const type = typeof params.type === 'string' ? params.type : undefined;
  const error = typeof params.error === 'string' ? params.error : undefined;
  const error_description =
    typeof params.error_description === 'string'
      ? params.error_description
      : undefined;

  // If Supabase redirected to Site URL (root /) with auth callback parameters,
  // forward immediately to /auth/callback so the session is securely established.
  if (code || token_hash || error) {
    const callbackParams = new URLSearchParams();
    if (code) callbackParams.set('code', code);
    if (token_hash) callbackParams.set('token_hash', token_hash);
    if (type) callbackParams.set('type', type);
    if (error) callbackParams.set('error', error);
    if (error_description) {
      callbackParams.set('error_description', error_description);
    }
    callbackParams.set('next', '/dashboard');
    redirect(`/auth/callback?${callbackParams.toString()}`);
  }

  const user = await getCurrentUser();
  if (user) {
    redirect('/dashboard');
  } else {
    redirect('/login');
  }
}
