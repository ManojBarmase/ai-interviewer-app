'use client';

import React, { useState } from 'react';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap,
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  Loader2,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  ArrowLeft,
  Sparkles,
} from 'lucide-react';

import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Retrieve and sanitize redirect target
  const rawRedirect =
    searchParams.get('redirectTo') || searchParams.get('next') || '/dashboard';
  const targetRedirect =
    rawRedirect.startsWith('/') && !rawRedirect.startsWith('//')
      ? rawRedirect
      : '/dashboard';

  // Check for callback or route errors in query string
  const queryError = searchParams.get('error');
  const initialErrorMessage =
    queryError === 'auth_callback_failed'
      ? 'Authentication session expired or failed. Please try signing in again.'
      : null;

  // Mode: "signin" or "signup"
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');

  // Form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // States
  const [isLoading, setIsLoading] = useState(false);
  const [isDemoLoading, setIsDemoLoading] = useState(false);
  const [error, setError] = useState<string | null>(initialErrorMessage);
  const [success, setSuccess] = useState<string | null>(null);

  const supabase = createClient();

  // ── Handle Email + Password Submission ──────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // Validation
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }
    if (mode === 'signup' && !name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    setIsLoading(true);

    try {
      if (mode === 'signin') {
        const { data, error: signInError } =
          await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          });

        if (signInError) {
          if (signInError.message.includes('Invalid login credentials')) {
            setError(
              'Invalid email or password. Please verify your credentials and try again.',
            );
          } else if (signInError.message.includes('Email not confirmed')) {
            setError(
              'Please confirm your email address before signing in. Check your inbox.',
            );
          } else {
            setError(signInError.message);
          }
          setIsLoading(false);
          return;
        }

        if (data.session) {
          router.replace(targetRedirect);
          router.refresh();
        }
      } else {
        // Sign up flow
        const origin =
          typeof window !== 'undefined' ? window.location.origin : '';
        const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent(targetRedirect)}`;

        const { data, error: signUpError } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo,
            data: {
              name: name.trim(),
              first_name: name.trim().split(' ')[0],
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          setIsLoading(false);
          return;
        }

        // Check if session was returned directly or if confirmation is needed
        if (data.session) {
          setSuccess('Account created successfully! Redirecting...');
          setTimeout(() => {
            router.replace(targetRedirect);
            router.refresh();
          }, 800);
        } else {
          setSuccess(
            'Account registered! Please check your email to confirm your account, or sign in below.',
          );
          setMode('signin');
          setIsLoading(false);
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'An unexpected error occurred. Please try again.',
      );
      setIsLoading(false);
    }
  };

  // ── Handle Instant Demo Access ─────────────────────────────────────────────
  const handleDemoAccess = async () => {
    setError(null);
    setSuccess(null);
    setIsDemoLoading(true);

    try {
      const res = await fetch('/api/auth/demo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to initialize demo session');
      }

      setSuccess('Demo workspace activated! Loading dashboard...');
      setTimeout(() => {
        router.replace(targetRedirect);
        router.refresh();
      }, 500);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to initialize demo access.',
      );
      setIsDemoLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md relative z-10">
      {/* ── Brand Header ── */}
      <div className="flex flex-col items-center text-center mb-8">
        <Link
          href="/"
          className="group inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-white/5 border border-white/10 hover:border-brand-500/30 transition-all duration-200 mb-5"
        >
          <div className="w-6 h-6 rounded-md bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-sm">
            <Zap size={14} className="text-white" />
          </div>
          <span className="text-xs font-semibold text-white/80 group-hover:text-white transition-colors">
            AI Mock Interviewer
          </span>
          <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-brand-500/20 text-brand-400 border border-brand-500/30">
            PRO
          </span>
        </Link>

        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          {mode === 'signin' ? 'Welcome back' : 'Create an account'}
        </h1>
        <p className="text-sm text-white/50 mt-1.5 max-w-sm">
          {mode === 'signin'
            ? 'Sign in to access your interview practice sessions and scorecards.'
            : 'Master technical, behavioral, and system design interviews with AI.'}
        </p>
      </div>

      {/* ── Main Auth Card ── */}
      <div className="bg-[hsl(222,28%,10%)]/90 border border-white/10 rounded-2xl p-6 sm:p-8 backdrop-blur-2xl shadow-2xl relative overflow-hidden">
        {/* Subtle accent line across the top */}
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-brand-500/80 to-transparent" />

        {/* ── Tabs (Sign In / Create Account) ── */}
        <div className="flex rounded-xl bg-white/5 p-1 mb-6 border border-white/5">
          <button
            type="button"
            id="tab-signin"
            onClick={() => {
              setMode('signin');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 ${
              mode === 'signin'
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            id="tab-signup"
            onClick={() => {
              setMode('signup');
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 ${
              mode === 'signup'
                ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* ── Feedback Alerts ── */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-start gap-2.5 p-3.5 mb-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs sm:text-sm"
              role="alert"
            >
              <AlertCircle size={16} className="text-red-400 shrink-0 mt-0.5" />
              <span className="flex-1 leading-snug">{error}</span>
            </motion.div>
          )}

          {success && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-start gap-2.5 p-3.5 mb-5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs sm:text-sm"
              role="status"
            >
              <CheckCircle2
                size={16}
                className="text-emerald-400 shrink-0 mt-0.5"
              />
              <span className="flex-1 leading-snug">{success}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Email & Password Form ── */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <div>
              <label
                htmlFor="user-fullname"
                className="block text-xs font-medium text-white/70 mb-1.5"
              >
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                  <User size={16} />
                </div>
                <input
                  id="user-fullname"
                  type="text"
                  autoComplete="name"
                  placeholder="Alex Vance"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={isLoading || isDemoLoading}
                  className="w-full pl-10 pr-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
                />
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="user-email"
              className="block text-xs font-medium text-white/70 mb-1.5"
            >
              Email Address
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                <Mail size={16} />
              </div>
              <input
                id="user-email"
                type="email"
                autoComplete="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading || isDemoLoading}
                className="w-full pl-10 pr-4 py-2.5 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="user-password"
                className="block text-xs font-medium text-white/70"
              >
                Password
              </label>
              {mode === 'signin' && (
                <span className="text-[11px] text-white/40 hover:text-white/70 cursor-pointer transition-colors">
                  Forgot password?
                </span>
              )}
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-white/40">
                <Lock size={16} />
              </div>
              <input
                id="user-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete={
                  mode === 'signin' ? 'current-password' : 'new-password'
                }
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading || isDemoLoading}
                className="w-full pl-10 pr-10 py-2.5 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors"
              />
              <button
                type="button"
                id="toggle-password-visibility"
                onClick={() => setShowPassword((p) => !p)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-white/40 hover:text-white/80 transition-colors"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            id="auth-submit-button"
            disabled={isLoading || isDemoLoading}
            className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-brand-600 via-brand-500 to-indigo-500 hover:from-brand-500 hover:to-indigo-400 text-white text-sm font-semibold flex items-center justify-center gap-2 shadow-lg shadow-brand-500/20 active:scale-[0.99] transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {isLoading ? (
              <>
                <Loader2 size={16} className="animate-spin text-white" />
                <span>
                  {mode === 'signin' ? 'Signing In...' : 'Creating Account...'}
                </span>
              </>
            ) : (
              <>
                <span>
                  {mode === 'signin'
                    ? 'Sign In to Dashboard'
                    : 'Get Started Free'}
                </span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* ── Divider ── */}
        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-3 bg-[hsl(222,28%,10%)] text-white/40 uppercase tracking-wider text-[10px] font-semibold">
              Or quick test
            </span>
          </div>
        </div>

        {/* ── Demo Candidate Instant Access ── */}
        <button
          type="button"
          id="demo-access-button"
          onClick={handleDemoAccess}
          disabled={isLoading || isDemoLoading}
          className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 hover:border-brand-500/40 text-white/90 hover:text-white text-xs sm:text-sm font-medium flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed group cursor-pointer"
        >
          {isDemoLoading ? (
            <>
              <Loader2 size={15} className="animate-spin text-brand-400" />
              <span>Initializing Demo Session...</span>
            </>
          ) : (
            <>
              <Sparkles
                size={15}
                className="text-amber-400 group-hover:scale-110 transition-transform"
              />
              <span>Continue as Demo Candidate</span>
              <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-brand-500/15 text-brand-400 border border-brand-500/20">
                1-Click
              </span>
            </>
          )}
        </button>

        {/* ── Security Trust Footer ── */}
        <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-center gap-2 text-[11px] text-white/40">
          <ShieldCheck size={14} className="text-emerald-400/80" />
          <span>Protected with enterprise 256-bit encryption</span>
        </div>
      </div>

      {/* ── Return to Home Link ── */}
      <div className="mt-6 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs text-white/50 hover:text-white transition-colors"
        >
          <ArrowLeft size={14} />
          <span>Return to Homepage</span>
        </Link>
      </div>
    </div>
  );
}
