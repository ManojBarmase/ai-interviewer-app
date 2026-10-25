/**
 * @file Environment Configuration & Validation Module
 * @description Single source of truth for all environment variables used across the application.
 * Provides strict validation, descriptive error messages on missing required variables,
 * and safe separation between server-only and browser-accessible variables.
 *
 * Designed to adhere to Next.js compilation model:
 * - Public variables (NEXT_PUBLIC_*) are statically referenced so Turbopack/Webpack can inline them into client bundles.
 * - Server variables are strictly guarded from leaking to the browser.
 * - Validation executes on the server runtime/build step and bypasses in the browser where dynamic process.env is unavailable.
 *
 * @example
 * ```ts
 * import { env } from '@/lib/config/env';
 * const appUrl = env.NEXT_PUBLIC_APP_URL;
 * const groqKey = env.GROQ_API_KEY;
 * ```
 */

/**
 * Retrieves a required environment variable.
 * On the server, throws a descriptive error if the variable is missing or empty.
 * On the client, server-only variables safely return an empty string to prevent bundling leaks.
 * Statically references NEXT_PUBLIC_* variables to ensure compiler inlining.
 *
 * @param key - The environment variable name
 * @param customValue - Optional explicit statically-referenced value for compiler inlining
 * @returns The resolved environment variable value
 */
export function requireEnv(key: string, customValue?: string): string {
  const isServer = typeof window === 'undefined';
  const isPublic = key.startsWith('NEXT_PUBLIC_');

  // Guard server-only variables from throwing or leaking in browser environments
  if (!isServer && !isPublic) {
    return '';
  }

  // Next.js compiler inlines process.env.NEXT_PUBLIC_* statically at build/transpile time.
  let value = customValue;
  if (value === undefined) {
    if (key === 'NEXT_PUBLIC_APP_URL') {
      value = process.env.NEXT_PUBLIC_APP_URL;
    } else if (key === 'NEXT_PUBLIC_SUPABASE_URL') {
      value = process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else if (key === 'NEXT_PUBLIC_SUPABASE_ANON_KEY') {
      value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      value = process.env[key];
    }
  }

  if (value === undefined || value === '') {
    if (key === 'NEXT_PUBLIC_APP_URL') {
      const fallbackUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.CI
          ? 'http://localhost:3000'
          : '';
      if (fallbackUrl) {
        return fallbackUrl;
      }
    }
    if (process.env.NODE_ENV === 'test') {
      return `mock-${key.toLowerCase()}`;
    }
    if (isServer) {
      throw new Error(
        `[env] Missing required environment variable: "${key}". Check your .env.local file.`,
      );
    }
    return '';
  }
  return value;
}

/**
 * Retrieves an optional environment variable with a fallback default value.
 *
 * @param key - The environment variable name
 * @param defaultValue - Fallback value if variable is undefined or empty
 * @returns The resolved value or fallback default
 */
export function optionalEnv(key: string, defaultValue = ''): string {
  const isServer = typeof window === 'undefined';
  const isPublic = key.startsWith('NEXT_PUBLIC_');

  if (!isServer && !isPublic) {
    return defaultValue;
  }

  let value: string | undefined;
  if (key === 'NEXT_PUBLIC_APP_ENV') {
    value = process.env.NEXT_PUBLIC_APP_ENV;
  } else if (key === 'NEXT_PUBLIC_SENTRY_DSN') {
    value = process.env.NEXT_PUBLIC_SENTRY_DSN;
  } else {
    value = process.env[key];
  }

  return value !== undefined && value !== '' ? value : defaultValue;
}

/**
 * Validates all required environment variables at module load time.
 * Collects and reports all missing variables in a single comprehensive error message.
 *
 * NOTE: Executes only in server environments (Node.js/SSR/build).
 * In browser runtime, dynamic process.env is unavailable because Next.js
 * replaces NEXT_PUBLIC_* variables statically via AST transformation.
 */
export function validateEnv(): void {
  // In the browser, public variables are statically inlined by the compiler,
  // and server variables are excluded by design. Runtime validation must only execute on the server.
  if (typeof window !== 'undefined') {
    return;
  }

  // During unit test execution, skip throwing to allow testing with isolated mocks
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const missing: string[] = [];

  // Required browser-safe variables (must be configured on the server)
  const requiredPublic = [
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ] as const;

  for (const key of requiredPublic) {
    let val = process.env[key];
    if ((val === undefined || val === '') && key === 'NEXT_PUBLIC_APP_URL') {
      val = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : process.env.CI
          ? 'http://localhost:3000'
          : undefined;
    }
    if (val === undefined || val === '') {
      missing.push(key);
    }
  }

  // Required server-only variables (never exposed to client)
  const requiredServer = ['GROQ_API_KEY', 'DATABASE_URL'] as const;
  for (const key of requiredServer) {
    const val = process.env[key];
    if (val === undefined || val === '') {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[env] Missing required environment variables:\n` +
        missing.map((key) => `  - ${key}`).join('\n') +
        `\nPlease configure them in your .env.local file.`,
    );
  }
}

// Run validation once at module initialization time
validateEnv();

/**
 * Typed application configuration object containing validated environment variables.
 */
export const env = {
  /* ─── PUBLIC (browser-safe, prefix NEXT_PUBLIC_) ─── */
  /**
   * Base URL of the application (e.g., http://localhost:3000 or production domain).
   */
  NEXT_PUBLIC_APP_URL: requireEnv(
    'NEXT_PUBLIC_APP_URL',
    process.env.NEXT_PUBLIC_APP_URL,
  ),

  /**
   * Supabase project URL for Auth and Database REST endpoints.
   */
  NEXT_PUBLIC_SUPABASE_URL: requireEnv(
    'NEXT_PUBLIC_SUPABASE_URL',
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),

  /**
   * Supabase anonymous public API key.
   */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: requireEnv(
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),

  /**
   * Runtime environment tier (development, preview, production).
   * @default 'development'
   */
  NEXT_PUBLIC_APP_ENV: optionalEnv(
    'NEXT_PUBLIC_APP_ENV',
    process.env.NEXT_PUBLIC_APP_ENV || 'development',
  ),

  NEXT_PUBLIC_SENTRY_DSN: optionalEnv('NEXT_PUBLIC_SENTRY_DSN', ''),

  /* ─── SERVER (never expose to client) ─── */
  /**
   * Groq AI API key used for ultra-fast LLM inference and streaming evaluation.
   */
  GROQ_API_KEY: requireEnv('GROQ_API_KEY'),

  /**
   * PostgreSQL database connection string (Supabase PgBouncer pooled connection).
   */
  DATABASE_URL: requireEnv('DATABASE_URL'),

  /* ─── SERVER OPTIONAL ─── */
  /**
   * Upstash Redis connection URL for caching and distributed rate limiting.
   * @default ''
   */
  KV_URL: optionalEnv('KV_URL', ''),

  /**
   * Upstash REST API URL for serverless Redis operations.
   * @default ''
   */
  KV_REST_API_URL: optionalEnv('KV_REST_API_URL', ''),

  /**
   * Upstash REST API authentication token.
   * @default ''
   */
  KV_REST_API_TOKEN: optionalEnv('KV_REST_API_TOKEN', ''),

  /**
   * Structured logging verbosity level ('fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace').
   * @default 'info'
   */
  LOG_LEVEL: optionalEnv('LOG_LEVEL', 'info'),

  /**
   * Controls whether 1-click demo candidate authentication is permitted.
   * @default 'false'
   */
  DEMO_MODE_ENABLED: optionalEnv('DEMO_MODE_ENABLED', 'false'),

  /**
   * Node execution environment ('development' | 'production' | 'test').
   * @default 'development'
   */
  NODE_ENV: optionalEnv('NODE_ENV', 'development'),
} as const;

export type Env = typeof env;
