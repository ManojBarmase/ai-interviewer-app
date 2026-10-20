'use client';

/**
 * @file DashboardSidebar.tsx
 * @description Fixed sidebar navigation matching the Figma design.
 * Collapsible on mobile via hamburger. Shows brand, nav links,
 * weekly goal progress, and user profile at the bottom.
 */

import { useState, useEffect } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import {
  LayoutDashboard,
  Mic,
  BookOpen,
  History,
  Menu,
  X,
  Zap,
  LogOut,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: <LayoutDashboard size={18} />,
  },
  { label: 'Practice', href: '/dashboard/setup', icon: <Mic size={18} /> },
  {
    label: 'Question bank',
    href: '/dashboard/questions',
    icon: <BookOpen size={18} />,
  },
  {
    label: 'Sessions',
    href: '/dashboard/sessions',
    icon: <History size={18} />,
  },
];

export function DashboardSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState({
    name: 'Alex',
    plan: 'Candidate',
  });

  useEffect(() => {
    async function loadUser() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const displayName =
            user.user_metadata?.name ||
            user.user_metadata?.first_name ||
            user.email?.split('@')[0] ||
            'Candidate';
          setUserProfile({ name: displayName, plan: 'Pro Tier' });
        } else if (
          typeof document !== 'undefined' &&
          document.cookie.includes('demo_candidate_session=true')
        ) {
          setUserProfile({ name: 'Demo Candidate', plan: 'Demo Sandbox' });
        }
      } catch {
        // Fallback to default
      }
    }
    loadUser();
  }, []);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/demo', { method: 'DELETE' }).catch(() => {});
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push('/login');
      router.refresh();
    } catch (e) {
      console.error('Sign out failed', e);
    }
  };

  // Weekly practice goals
  const weeklyGoal = { current: 1, target: 3 };

  const navContent = (
    <>
      {/* -- Brand --------------------------------------------------------- */}
      <div className="flex items-center gap-3 px-4 pt-6 pb-4">
        <div className="w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center">
          <Zap size={16} className="text-white" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">
            Mock Interviewer
          </p>
          <p className="text-[11px] text-white/40 truncate">Practice with AI</p>
        </div>
      </div>

      {/* -- Navigation ---------------------------------------------------- */}
      <nav className="flex-1 px-3 mt-2 space-y-1">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={[
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                isActive
                  ? 'bg-brand-500/15 text-brand-400'
                  : 'text-white/60 hover:bg-white/5 hover:text-white/90',
              ].join(' ')}
            >
              {item.icon}
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* -- Weekly Goal (bottom) --------------------------------------- */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-white/50">Weekly goal</span>
          <span className="text-xs font-semibold text-white/70">
            {weeklyGoal.current}/{weeklyGoal.target}
          </span>
        </div>
        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-brand-500 transition-all duration-500"
            style={{
              width: `${(weeklyGoal.current / weeklyGoal.target) * 100}%`,
            }}
          />
        </div>
      </div>

      {/* -- User Profile ----------------------------------------------- */}
      <div className="px-4 py-4 border-t border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-brand-600 flex items-center justify-center text-sm font-bold text-white uppercase">
            {userProfile.name.charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white/90 truncate">
              {userProfile.name}
            </p>
            <p className="text-[11px] text-white/40 truncate">
              {userProfile.plan}
            </p>
          </div>
          <button
            onClick={handleSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="p-1.5 rounded-md hover:bg-white/10 transition-colors text-white/40 hover:text-red-400 cursor-pointer"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* -- Mobile Hamburger ---------------------------------------------- */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-surface-raised/80 backdrop-blur-md border border-white/10 text-white/70 hover:text-white"
        aria-label="Open navigation"
      >
        <Menu size={20} />
      </button>

      {/* -- Mobile Overlay ------------------------------------------------ */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* -- Sidebar Panel ------------------------------------------------- */}
      <aside
        className={[
          'fixed top-0 left-0 z-50 h-screen w-[220px] flex flex-col',
          'bg-[hsl(222,28%,9%)] border-r border-white/5',
          'transition-transform duration-300 ease-in-out',
          // Mobile: slide in/out, Desktop: always visible
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        ].join(' ')}
      >
        {/* Mobile close button */}
        <button
          onClick={() => setMobileOpen(false)}
          className="lg:hidden absolute top-4 right-3 p-1 rounded-md text-white/40 hover:text-white"
          aria-label="Close navigation"
        >
          <X size={18} />
        </button>

        {navContent}
      </aside>
    </>
  );
}
