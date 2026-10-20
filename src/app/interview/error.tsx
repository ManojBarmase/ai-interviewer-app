'use client';

import { useEffect } from 'react';

import Link from 'next/link';

import { MicOff, RefreshCw, Home, ShieldAlert } from 'lucide-react';

/**
 * Enterprise Interview Room Error Boundary
 *
 * Catches audio hardware, Web Speech API, or network disconnect exceptions during active interviews.
 * Provides guided hardware recovery steps so candidates aren't left stranded.
 */
export default function InterviewError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[InterviewError] Active interview room failure:', {
      message: error.message,
      digest: error.digest,
      stack: error.stack,
    });
  }, [error]);

  const isMediaError =
    error.message.toLowerCase().includes('audio') ||
    error.message.toLowerCase().includes('media') ||
    error.message.toLowerCase().includes('microphone') ||
    error.message.toLowerCase().includes('permission');

  return (
    <div className="min-h-screen w-full bg-[#0b0c10] text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-lg bg-[#12131a] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
        {/* Hardware / Session Warning Icon */}
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center mx-auto mb-6 shadow-[0_0_25px_-5px_rgba(244,63,94,0.3)]">
          {isMediaError ? (
            <MicOff className="w-8 h-8 text-rose-400" />
          ) : (
            <ShieldAlert className="w-8 h-8 text-rose-400" />
          )}
        </div>

        <span className="text-[11px] font-semibold tracking-wider uppercase px-3 py-1 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 inline-block mb-3">
          Session Disrupted
        </span>

        <h1 className="text-2xl font-bold text-white mb-2">
          {isMediaError
            ? 'Audio or Microphone Access Error'
            : 'Interview Session Disrupted'}
        </h1>

        <p className="text-sm text-slate-400 mb-6 leading-relaxed">
          {isMediaError
            ? 'We were unable to access your microphone or browser audio engine. Please check your browser permission settings and ensure your microphone is connected.'
            : 'A network interruption or streaming error disconnected your live interview session. You can attempt to reconnect or return to setup.'}
        </p>

        {/* Diagnostic Checklist for Candidate */}
        <div className="bg-[#0b0c10] border border-white/5 rounded-xl p-4 text-left mb-6 text-xs text-slate-400 space-y-2">
          <p className="font-semibold text-slate-300">Quick Troubleshooting:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-400">
            <li>
              Ensure microphone permissions are set to &quot;Allow&quot; in the
              URL bar.
            </li>
            <li>Close other apps (Zoom, Teams, Meet) using your microphone.</li>
            <li>
              Check your internet connection if the AI audio stopped streaming.
            </li>
          </ul>
        </div>

        {error.digest && (
          <p className="text-[11px] text-slate-500 font-mono mb-6">
            Error Ref: {error.digest}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => reset()}
            type="button"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 transition shadow-lg shadow-blue-500/20 cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Reconnect to Room
          </button>
          <Link
            href="/dashboard"
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-slate-300 bg-white/5 hover:bg-white/10 border border-white/10 transition"
          >
            <Home className="w-4 h-4" />
            Return to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
