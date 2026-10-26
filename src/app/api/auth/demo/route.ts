import { cookies } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { createDemoSignature } from '@/lib/auth/demo-session';
import { env } from '@/lib/config/env';
import {
  DEMO_SESSION_COOKIE,
  DEMO_SESSION_CREATED_AT_COOKIE,
  DEMO_SESSION_SIGNATURE_COOKIE,
} from '@/lib/constants';

/**
 * Enterprise Demo Session Handler
 *
 * Provides instant 1-click access for reviewers, recruiters, and demo candidates
 * without relying on external SMTP email confirmation or hitting Supabase email rate limits.
 * Protected by feature flag and OWASP-compliant same-origin/CSRF verification.
 */

/**
 * Validates that the request origin matches the application host or trusted deployment domains.
 * Follows OWASP Cross-Site Request Forgery (CSRF) Prevention recommendations for Same-Origin requests.
 */
export function isValidOrigin(request: NextRequest): boolean {
  // If browser Sec-Fetch-Site indicates same-origin, request originated from our own app
  const secFetchSite = request.headers.get('sec-fetch-site');
  if (secFetchSite === 'same-origin') {
    return true;
  }

  let originToValidate = request.headers.get('origin');
  if (!originToValidate) {
    const referer = request.headers.get('referer');
    if (referer) {
      try {
        originToValidate = new URL(referer).origin;
      } catch {
        return false;
      }
    }
  }

  // If no Origin or Referer could be determined
  if (!originToValidate) {
    // In local development or testing, permit headless requests
    return env.NODE_ENV !== 'production';
  }

  let originUrl: URL;
  try {
    originUrl = new URL(originToValidate);
  } catch {
    return false;
  }

  const originHost = originUrl.host.toLowerCase();
  const originHostname = originUrl.hostname.toLowerCase();

  // 1. Dynamic Reverse Proxy Host Match (X-Forwarded-Host or Host header)
  const rawForwardedHost = request.headers.get('x-forwarded-host');
  const forwardedHost = rawForwardedHost
    ? (rawForwardedHost.split(',')[0]?.trim().toLowerCase() ?? null)
    : null;
  const hostHeader = request.headers.get('host')?.toLowerCase() ?? null;
  const nextUrlHost = request.nextUrl.host.toLowerCase();

  const forwardedHostname = forwardedHost
    ? (forwardedHost.split(':')[0] ?? '')
    : '';
  const hostHeaderHostname = hostHeader ? (hostHeader.split(':')[0] ?? '') : '';

  if (
    (forwardedHost &&
      (originHost === forwardedHost || originHostname === forwardedHostname)) ||
    (hostHeader &&
      (originHost === hostHeader || originHostname === hostHeaderHostname)) ||
    originHost === nextUrlHost ||
    originHostname === request.nextUrl.hostname.toLowerCase()
  ) {
    return true;
  }

  // 2. Development / Localhost Origins
  if (
    originHostname === 'localhost' ||
    originHostname === '127.0.0.1' ||
    originHost === 'localhost:3000' ||
    originHost === '127.0.0.1:3000'
  ) {
    return true;
  }

  // 3. Match against configured NEXT_PUBLIC_APP_URL
  if (env.NEXT_PUBLIC_APP_URL) {
    try {
      const configuredUrl = new URL(env.NEXT_PUBLIC_APP_URL);
      if (
        originHost === configuredUrl.host.toLowerCase() ||
        originHostname === configuredUrl.hostname.toLowerCase()
      ) {
        return true;
      }
    } catch {
      // Ignore invalid configured URL
    }
  }

  // 4. Match against Vercel Platform Environment Variables
  const vercelProjectUrl =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.toLowerCase().replace(
      /^https?:\/\//,
      '',
    );
  if (
    vercelProjectUrl &&
    (originHost === vercelProjectUrl || originHostname === vercelProjectUrl)
  ) {
    return true;
  }

  const vercelUrl = process.env.VERCEL_URL?.toLowerCase().replace(
    /^https?:\/\//,
    '',
  );
  if (vercelUrl && (originHost === vercelUrl || originHostname === vercelUrl)) {
    return true;
  }

  // 5. Allow preview / deployment subdomains belonging to this project
  if (
    originHostname.endsWith('.vercel.app') &&
    originHostname.includes('ai-interviewer-app')
  ) {
    return true;
  }

  return false;
}

export async function POST(request: NextRequest) {
  // 1. Verify demo mode is not explicitly disabled
  const isDemoDisabled =
    env.DEMO_MODE_ENABLED === 'false' ||
    process.env.DEMO_MODE_ENABLED === 'false';

  if (isDemoDisabled) {
    return NextResponse.json(
      {
        error: 'Demo candidate mode is currently disabled in this environment.',
        message:
          'Demo candidate mode is currently disabled in this environment.',
        code: 'DEMO_DISABLED',
      },
      { status: 403, headers: { Vary: 'Cookie' } },
    );
  }

  // 2. CSRF-style Origin & Host check
  if (!isValidOrigin(request)) {
    return NextResponse.json(
      {
        error:
          'Origin mismatch rejected. CSRF protection blocked this request.',
        message:
          'Origin mismatch rejected. CSRF protection blocked this request.',
        code: 'CSRF_REJECTED',
      },
      { status: 403, headers: { Vary: 'Cookie' } },
    );
  }

  const cookieStore = await cookies();
  const createdAt = Date.now().toString();
  const signature = createDemoSignature(createdAt);

  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 60 * 60 * 24, // 24 hours
  };

  // 3. Set HttpOnly, secure session cookies with HMAC-SHA256 signature
  cookieStore.set(DEMO_SESSION_COOKIE, 'true', cookieOptions);
  cookieStore.set(DEMO_SESSION_CREATED_AT_COOKIE, createdAt, cookieOptions);
  cookieStore.set(DEMO_SESSION_SIGNATURE_COOKIE, signature, cookieOptions);

  const response = NextResponse.json(
    {
      success: true,
      message: 'Demo candidate session initialized successfully.',
    },
    {
      headers: {
        Vary: 'Cookie',
      },
    },
  );

  response.cookies.set(DEMO_SESSION_COOKIE, 'true', cookieOptions);
  response.cookies.set(
    DEMO_SESSION_CREATED_AT_COOKIE,
    createdAt,
    cookieOptions,
  );
  response.cookies.set(DEMO_SESSION_SIGNATURE_COOKIE, signature, cookieOptions);

  return response;
}

export async function DELETE() {
  const cookieStore = await cookies();
  cookieStore.delete(DEMO_SESSION_COOKIE);
  cookieStore.delete(DEMO_SESSION_CREATED_AT_COOKIE);
  cookieStore.delete(DEMO_SESSION_SIGNATURE_COOKIE);

  const response = NextResponse.json(
    { success: true, message: 'Demo session cleared.' },
    {
      headers: {
        Vary: 'Cookie',
      },
    },
  );

  response.cookies.delete(DEMO_SESSION_COOKIE);
  response.cookies.delete(DEMO_SESSION_CREATED_AT_COOKIE);
  response.cookies.delete(DEMO_SESSION_SIGNATURE_COOKIE);

  return response;
}
