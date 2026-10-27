import type { NextRequest } from 'next/server';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { POST } from '@/app/api/interview/chat/route';
import {
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '@/server/errors/AppError';
import { chatService } from '@/server/services/chat.service';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

vi.mock('@/server/utils/auth-guard', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/server/utils/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/server/services/chat.service', () => ({
  chatService: {
    handleChatStream: vi.fn(),
  },
}));

function createMockRequest(body?: unknown): NextRequest {
  return {
    json: async () => body,
  } as unknown as NextRequest;
}

describe('POST /api/interview/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValueOnce(
      new UnauthorizedError('Unauthorized. Please sign in.'),
    );

    const res = await POST(createMockRequest({ sessionId: 's-1' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe('UNAUTHORIZED');
  });

  it('returns 429 when rate limit exceeded', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(applyRateLimit).mockRejectedValueOnce(
      new RateLimitError('Too many requests.'),
    );

    const res = await POST(createMockRequest({ sessionId: 's-1' }));
    expect(res.status).toBe(429);
    const data = await res.json();
    expect(data.code).toBe('RATE_LIMIT_EXCEEDED');
  });

  it('returns 422 when payload validation fails in service', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);
    vi.mocked(chatService.handleChatStream).mockRejectedValueOnce(
      new ValidationError('Validation failed', [{ message: 'Required' }]),
    );

    const res = await POST(createMockRequest({ sessionId: '' }));
    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.code).toBe('VALIDATION_ERROR');
    expect(data.error).toBe('Validation failed');
  });

  it('returns streaming response (200, text/event-stream) on success', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);

    const mockStreamResponse = new Response('data: {"type":"chunk"}\n\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
      },
    });
    vi.mocked(chatService.handleChatStream).mockResolvedValueOnce(
      mockStreamResponse,
    );

    const res = await POST(
      createMockRequest({
        sessionId: 'sess-123',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    expect(chatService.handleChatStream).toHaveBeenCalledWith(
      {
        sessionId: 'sess-123',
        messages: [{ role: 'user', content: 'hello' }],
      },
      'user-1',
    );
  });

  it('handles unexpected internal errors with 500 INTERNAL_SERVER_ERROR', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);
    vi.mocked(chatService.handleChatStream).mockRejectedValueOnce(
      new Error('Catastrophic failure'),
    );

    const res = await POST(
      createMockRequest({
        sessionId: 'sess-123',
        messages: [{ role: 'user', content: 'hello' }],
      }),
    );

    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.code).toBe('INTERNAL_SERVER_ERROR');
  });
});
