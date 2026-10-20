'use client';

import { useEffect } from 'react';

import Link from 'next/link';

import { AlertTriangle, RefreshCw, LayoutDashboard, LogIn } from 'lucide-react';

/**
 * Enterprise Dashboard Error Boundary
 *
 * Catches runtime server errors within /dashboard sub-routes (analytics, reports, setup, questions).
 * Preserves the dashboard sidebar layout so user navigation is never trapped.
 */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[DashboardError] Error in dashboard boundary:', {
      message: error.message,
      digest: error.digest,
    });
  }, [error]);

  const isAuthError =
    error.message.toLowerCase().includes('unauthorized') ||
    error.message.toLowerCase().includes('auth') ||
    error.message.toLowerCase().includes('session');

  return (
    <div className="min-h-[70vh] w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#12131a] border border-white/10 rounded-2xl p-8 shadow-xl text-center">
        {/* Warning Icon Badge */}
        <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-5 shadow-[0_0_20px_-3px_rgba(245,158,11,0.25)]">
          <AlertTriangle className="w-7 h-7 text-amber-400" />
        </div>

        <span className="text-[11px] font-semibold tracking-wider uppercase px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20 inline-block mb-3">
          Dashboard Service Notice
        </span>

        <h2 className="text-xl font-bold text-white mb-2">
          Unable to load dashboard data
        </h2>

        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          {isAuthError
            ? 'Your active session may have expired. Please re-authenticate to access your dashboard metrics.'
            : 'We encountered an error while retrieving your analytics or sessions. You can retry the request.'}
        </p>

        {/* Digest Info */}
        {error.digest && (
          <div className="bg-[#0b0c10] border border-white/5 rounded-lg px-3 py-2 mb-6 text-left">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block">
              Reference Code
            </span>
            <code className="text-xs text-amber-300 font-mono select-all">
              {error.digest}
            </code>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col gap-2.5">
          <button
            onClick={() => reset()}
            type="button"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition shadow-lg shadow-blue-500/20 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Request
          </button>

          {isAuthError ? (
            <Link
              href="/login?redirectTo=/dashboard"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition"
            >
              <LogIn className="w-4 h-4" />
              Sign In Again
            </Link>
          ) : (
            <Link
              href="/dashboard"
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition"
            >
              <LayoutDashboard className="w-4 h-4" />
              Return to Overview
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
