import type { NextRequest } from 'next/server';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { GET } from '@/app/auth/callback/route';

const mockCookieStore = {
  set: vi.fn(),
  delete: vi.fn(),
  get: vi.fn(),
  getAll: vi.fn(() => []),
};

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mockCookieStore),
}));

const mockExchangeCode = vi.fn();
const mockVerifyOtp = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCode,
      verifyOtp: mockVerifyOtp,
    },
  })),
}));

function createMockRequest(url: string): NextRequest {
  const parsed = new URL(url);
  return {
    url,
    nextUrl: parsed,
    headers: new Headers({ host: parsed.host }),
  } as unknown as NextRequest;
}

describe('Auth Callback Route Handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExchangeCode.mockResolvedValue({ data: { session: {} }, error: null });
    mockVerifyOtp.mockResolvedValue({ data: { session: {} }, error: null });
  });

  it('exchanges code for session and redirects to dashboard with verified badge', async () => {
    const req = createMockRequest(
      'http://localhost:3000/auth/callback?code=test-auth-code&next=/dashboard',
    );
    const res = await GET(req);

    expect(mockExchangeCode).toHaveBeenCalledWith('test-auth-code');
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
    expect(location).toContain('verified=true');
  });

  it('verifies token_hash for email confirmation and redirects to dashboard', async () => {
    const req = createMockRequest(
      'http://localhost:3000/auth/callback?token_hash=pkce_abc123&type=signup&next=/dashboard',
    );
    const res = await GET(req);

    expect(mockVerifyOtp).toHaveBeenCalledWith({
      token_hash: 'pkce_abc123',
      type: 'signup',
    });
    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
    expect(location).toContain('verified=true');
  });

  it('prevents open redirect attacks when malicious next URL is provided', async () => {
    const req = createMockRequest(
      'http://localhost:3000/auth/callback?code=test-code&next=https://evil.com',
    );
    const res = await GET(req);

    expect(mockExchangeCode).toHaveBeenCalledWith('test-code');
    const location = res.headers.get('location');
    expect(location).toContain('/dashboard');
    expect(location).not.toContain('evil.com');
  });

  it('redirects to login with error when code exchange fails', async () => {
    mockExchangeCode.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid or expired code' },
    });

    const req = createMockRequest(
      'http://localhost:3000/auth/callback?code=bad-code',
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=Invalid+or+expired+code');
  });

  it('redirects to login when Supabase returns an auth error parameter', async () => {
    const req = createMockRequest(
      'http://localhost:3000/auth/callback?error=access_denied&error_description=Email+link+expired',
    );
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login');
    expect(location).toContain('error=Email+link+expired');
  });

  it('redirects to login with fallback error when no valid auth params are present', async () => {
    const req = createMockRequest('http://localhost:3000/auth/callback');
    const res = await GET(req);

    expect(res.status).toBe(307);
    const location = res.headers.get('location');
    expect(location).toContain('/login?error=auth_callback_failed');
  });
});
