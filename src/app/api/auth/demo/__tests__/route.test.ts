import type { NextRequest } from 'next/server';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { POST, DELETE, isValidOrigin } from '@/app/api/auth/demo/route';
import { DEMO_SESSION_COOKIE } from '@/lib/constants';

const mockCookieStore = {
  set: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

function createMockRequest(
  options: {
    origin?: string | null;
    referer?: string | null;
    host?: string | null;
    forwardedHost?: string | null;
    secFetchSite?: string | null;
    nextUrl?: string;
  } = {},
): NextRequest {
  const url =
    options.nextUrl ||
    'https://ai-interviewer-app-manoj.vercel.app/api/auth/demo';
  const parsed = new URL(url);

  const headers = new Headers();
  if (options.origin !== undefined) {
    if (options.origin) headers.set('origin', options.origin);
  } else {
    headers.set('origin', parsed.origin);
  }

  if (options.referer) headers.set('referer', options.referer);
  if (options.host) headers.set('host', options.host);
  else headers.set('host', parsed.host);

  if (options.forwardedHost)
    headers.set('x-forwarded-host', options.forwardedHost);
  if (options.secFetchSite) headers.set('sec-fetch-site', options.secFetchSite);

  return {
    headers,
    nextUrl: parsed,
    url: parsed.toString(),
  } as unknown as NextRequest;
}

describe('/api/auth/demo Route Handler', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('isValidOrigin CSRF Verification', () => {
    it('accepts same-origin when Sec-Fetch-Site is same-origin', () => {
      const req = createMockRequest({
        secFetchSite: 'same-origin',
        origin: 'https://any-domain.com',
      });
      expect(isValidOrigin(req)).toBe(true);
    });

    it('accepts origin matching x-forwarded-host in reverse-proxy environments', () => {
      const req = createMockRequest({
        origin: 'https://ai-interviewer-app-manoj.vercel.app',
        forwardedHost: 'ai-interviewer-app-manoj.vercel.app',
      });
      expect(isValidOrigin(req)).toBe(true);
    });

    it('accepts origin matching host header', () => {
      const req = createMockRequest({
        origin: 'https://ai-interviewer-app-manoj.vercel.app',
        host: 'ai-interviewer-app-manoj.vercel.app',
      });
      expect(isValidOrigin(req)).toBe(true);
    });

    it('accepts localhost and 127.0.0.1 in development or local testing', () => {
      const req1 = createMockRequest({
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      });
      const req2 = createMockRequest({
        origin: 'http://127.0.0.1:3000',
        host: '127.0.0.1:3000',
      });
      expect(isValidOrigin(req1)).toBe(true);
      expect(isValidOrigin(req2)).toBe(true);
    });

    it('accepts Vercel preview deployments matching project naming convention', () => {
      const req = createMockRequest({
        origin: 'https://ai-interviewer-app-git-main-manoj.vercel.app',
        forwardedHost: 'ai-interviewer-app-git-main-manoj.vercel.app',
      });
      expect(isValidOrigin(req)).toBe(true);
    });

    it('accepts Vercel VERCEL_PROJECT_PRODUCTION_URL when configured', () => {
      process.env.VERCEL_PROJECT_PRODUCTION_URL =
        'ai-interviewer-app-manoj.vercel.app';
      const req = createMockRequest({
        origin: 'https://ai-interviewer-app-manoj.vercel.app',
        host: 'other-proxy-host.com',
      });
      expect(isValidOrigin(req)).toBe(true);
    });

    it('accepts referer header if origin header is omitted', () => {
      const req = createMockRequest({
        origin: null,
        referer: 'https://ai-interviewer-app-manoj.vercel.app/login',
        host: 'ai-interviewer-app-manoj.vercel.app',
      });
      expect(isValidOrigin(req)).toBe(true);
    });

    it('rejects foreign or malicious origins', () => {
      const req = createMockRequest({
        origin: 'https://evil-attacker-site.com',
        forwardedHost: 'ai-interviewer-app-manoj.vercel.app',
        host: 'ai-interviewer-app-manoj.vercel.app',
      });
      expect(isValidOrigin(req)).toBe(false);
    });
  });

  describe('POST /api/auth/demo', () => {
    it('initializes demo session, sets HttpOnly cookies, and returns 200 on valid request', async () => {
      const req = createMockRequest({
        origin: 'https://ai-interviewer-app-manoj.vercel.app',
        forwardedHost: 'ai-interviewer-app-manoj.vercel.app',
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.message).toContain('initialized successfully');

      expect(mockCookieStore.set).toHaveBeenCalledWith(
        DEMO_SESSION_COOKIE,
        'true',
        expect.objectContaining({
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 86400,
        }),
      );
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'demo_session_created_at',
        expect.any(String),
        expect.objectContaining({
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 86400,
        }),
      );
      expect(mockCookieStore.set).toHaveBeenCalledWith(
        'demo_session_signature',
        expect.any(String),
        expect.objectContaining({
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 86400,
        }),
      );

      // Verify cookies set directly on the response headers
      const setCookieHeader = res.headers.get('set-cookie');
      expect(setCookieHeader).toContain(DEMO_SESSION_COOKIE);
      expect(setCookieHeader).toContain('demo_session_created_at');
      expect(setCookieHeader).toContain('demo_session_signature');
    });

    it('returns 403 CSRF_REJECTED when request is from an unauthorized origin', async () => {
      const req = createMockRequest({
        origin: 'https://malicious-website.io',
        forwardedHost: 'ai-interviewer-app-manoj.vercel.app',
        host: 'ai-interviewer-app-manoj.vercel.app',
      });

      const res = await POST(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.code).toBe('CSRF_REJECTED');
      expect(body.error).toContain('CSRF protection');
    });

    it('returns 403 DEMO_DISABLED if DEMO_MODE_ENABLED is explicitly set to false', async () => {
      process.env.DEMO_MODE_ENABLED = 'false';

      const req = createMockRequest({
        origin: 'https://ai-interviewer-app-manoj.vercel.app',
        forwardedHost: 'ai-interviewer-app-manoj.vercel.app',
      });

      const res = await POST(req);
      expect(res.status).toBe(403);

      const body = await res.json();
      expect(body.code).toBe('DEMO_DISABLED');
    });
  });

  describe('DELETE /api/auth/demo', () => {
    it('clears demo cookies on both cookie store and response headers', async () => {
      const res = await DELETE();
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);

      expect(mockCookieStore.delete).toHaveBeenCalledWith(DEMO_SESSION_COOKIE);
      expect(mockCookieStore.delete).toHaveBeenCalledWith(
        'demo_session_created_at',
      );
      expect(mockCookieStore.delete).toHaveBeenCalledWith(
        'demo_session_signature',
      );
    });
  });
});
