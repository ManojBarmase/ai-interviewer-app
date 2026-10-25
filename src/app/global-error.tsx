'use client';

import { useEffect } from 'react';

import * as Sentry from '@sentry/nextjs';

/**
 * Enterprise Root Global Error Boundary
 *
 * Replaces root layout if a critical unhandled exception occurs in root server components.
 * Per Next.js App Router rules, global-error MUST define its own <html> and <body> tags.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log catastrophic error with correlation digest to client console
    console.error('[GlobalError] Root error boundary caught:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
    Sentry.captureException(error, { extra: { digest: error.digest } });
  }, [error]);

  return (
    <html lang="en" className="dark h-full">
      <body className="min-h-full bg-[#0b0c10] text-slate-100 font-sans antialiased flex items-center justify-center p-6 selection:bg-brand-500/20">
        <main className="w-full max-w-lg bg-[#12131a] border border-white/10 rounded-2xl p-8 shadow-2xl backdrop-blur-xl flex flex-col items-center text-center">
          {/* Glowing Status Icon */}
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mb-6 shadow-[0_0_30px_-5px_rgba(244,63,94,0.3)]">
            <svg
              className="w-8 h-8 text-rose-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>

          <span className="text-xs font-semibold tracking-wider uppercase px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-3">
            System Failure
          </span>

          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            Something went critically wrong
          </h1>

          <p className="text-sm text-slate-400 mb-6 leading-relaxed">
            An unexpected error occurred in the core application engine. Our
            telemetry system has logged this incident.
          </p>

          {/* Digest Badge for Enterprise Support */}
          {error.digest && (
            <div className="w-full bg-[#0b0c10] border border-white/5 rounded-lg px-4 py-2.5 mb-6 text-left">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1">
                Incident Digest
              </span>
              <code className="text-xs text-rose-300 font-mono select-all break-all">
                {error.digest}
              </code>
            </div>
          )}

          {/* Action CTAs */}
          <div className="w-full flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => reset()}
              type="button"
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition shadow-lg shadow-blue-500/20 cursor-pointer"
            >
              Try Recovery
            </button>
            <button
              onClick={() => {
                window.location.replace('/');
              }}
              type="button"
              className="flex-1 inline-flex items-center justify-center px-4 py-2.5 rounded-xl font-medium text-sm text-slate-300 bg-white/5 hover:bg-white/10 active:bg-white/15 border border-white/10 transition cursor-pointer"
            >
              Go to Home
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
