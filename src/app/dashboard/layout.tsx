import { redirect } from 'next/navigation';

import { DashboardSidebar } from '@/components/layouts/DashboardSidebar/DashboardSidebar';
import { getCurrentUser } from '@/lib/auth/get-current-user';

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();

  // Enterprise Standard: Defense-in-Depth verification at layout level
  if (!user) {
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
