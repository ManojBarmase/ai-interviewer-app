import { Suspense } from 'react';

import { Loader2 } from 'lucide-react';
import { type Metadata } from 'next';

import { LoginForm } from '@/features/auth';

export const metadata: Metadata = {
  title: 'Sign In | AI Mock Interviewer',
  description:
    'Sign in to access your AI mock interview dashboard, question bank, and detailed performance scorecards.',
};

function LoginLoadingSkeleton() {
  return (
    <div className="w-full max-w-md bg-[hsl(222,28%,10%)]/80 border border-white/10 rounded-2xl p-8 backdrop-blur-xl flex flex-col items-center justify-center min-h-[420px]">
      <Loader2 size={32} className="animate-spin text-brand-400 mb-3" />
      <p className="text-sm text-white/50">Loading sign in...</p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen bg-[hsl(222,28%,7%)] text-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* ── Ambient Background Lighting Effects ── */}
      <div
        aria-hidden="true"
        className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-brand-500/10 rounded-full blur-[140px] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-10 right-1/4 w-[400px] h-[400px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute top-10 left-10 w-[300px] h-[300px] bg-indigo-500/5 rounded-full blur-[100px] pointer-events-none"
      />

      {/* ── Login Form wrapped in Suspense for safe useSearchParams access ── */}
      <Suspense fallback={<LoginLoadingSkeleton />}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
