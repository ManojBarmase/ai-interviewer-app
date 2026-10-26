import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { createServerClient } from '@supabase/ssr';

import { DashboardSidebar } from '@/components/layouts/DashboardSidebar/DashboardSidebar';
import { DEMO_SESSION_COOKIE } from '@/lib/constants';

export default async function DashboardLayout({
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

  // Enterprise Standard: Defense-in-Depth verification at layout level
  if (!user && !isDemoSession) {
    redirect('/login?redirectTo=/dashboard');
  }

  return (
    <div className="min-h-screen bg-[hsl(222,28%,7%)]">
      <DashboardSidebar />
      {/* Main content — offset by sidebar width on desktop */}
      <main className="lg:ml-[220px] min-h-screen">{children}</main>
    </div>
  );
}
