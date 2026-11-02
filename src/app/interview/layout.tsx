import { redirect } from 'next/navigation';

import { getCurrentUser } from '@/lib/auth/get-current-user';

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
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login?redirectTo=/interview');
  }

  return children;
}
