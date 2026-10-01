/**
 * @file Environment configuration
 * @description Single source of truth for all environment variables.
 * Throws at startup if required vars are missing — fail fast pattern.
 *
 * Usage:
 *   import { env } from '@/lib/config/env';
 *   const apiUrl = env.NEXT_PUBLIC_API_URL;
 */

function requireEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new Error(
      `[env] Missing required environment variable: "${key}". ` +
        `Check your .env.local file.`,
    );
  }
  return value;
}

export const env = {
  /* ── Public (browser-accessible) ── */
  NEXT_PUBLIC_APP_URL: requireEnv('NEXT_PUBLIC_APP_URL'),

  /* ── Server-only (never expose to client) ── */
  NODE_ENV: process.env.NODE_ENV ?? 'development',
} as const;

export type Env = typeof env;
