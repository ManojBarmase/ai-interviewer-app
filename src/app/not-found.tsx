import Link from 'next/link';

import { Compass, LayoutDashboard, PlusCircle, Home } from 'lucide-react';

/**
 * Enterprise 404 Not Found Page
 *
 * Renders when a requested session, scorecard, or sub-route does not exist.
 * Provides clear navigation recovery options back to active workflows.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#0b0c10] text-slate-100 flex items-center justify-center p-6 selection:bg-brand-500/20">
      <div className="w-full max-w-lg bg-[#12131a] border border-white/10 rounded-3xl p-8 md:p-10 shadow-2xl backdrop-blur-xl text-center relative overflow-hidden">
        {/* Subtle Ambient Glow */}
        <div className="absolute -top-20 -left-20 w-44 h-44 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -right-20 w-44 h-44 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* 404 Icon & Tag */}
        <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 shadow-inner">
          <Compass className="w-8 h-8 text-blue-400 animate-pulse" />
        </div>

        <span className="text-xs font-semibold tracking-widest uppercase px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 inline-block mb-3">
          Error 404 · Destination Missing
        </span>

        <h1 className="text-3xl font-extrabold text-white tracking-tight mb-3">
          Resource Not Found
        </h1>

        <p className="text-sm text-slate-400 mb-8 leading-relaxed max-w-sm mx-auto">
          The interview room, evaluation scorecard, or page you requested could
          not be found or may have been deleted.
        </p>

        {/* Navigation Quick Links */}
        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="w-full inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition shadow-lg shadow-blue-500/20"
          >
            <LayoutDashboard className="w-4 h-4" />
            Go to Dashboard Overview
          </Link>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/dashboard/setup"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition"
            >
              <PlusCircle className="w-4 h-4 text-emerald-400" />
              Configure Interview
            </Link>

            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-xs text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition"
            >
              <Home className="w-4 h-4 text-slate-400" />
              Return Home
            </Link>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 pt-6 border-t border-white/5 text-[11px] text-slate-500">
          AI Interviewer Enterprise Platform · Status: Operational
        </div>
      </div>
    </div>
  );
}
