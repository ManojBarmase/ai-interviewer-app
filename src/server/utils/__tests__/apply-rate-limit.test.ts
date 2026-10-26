import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RateLimitError } from '@/server/errors/AppError';
import {
  chatRateLimit,
  evalRateLimit,
  generalRateLimit,
  resumeRateLimit,
} from '@/server/integrations/cache/ratelimit';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';

vi.mock('@/server/integrations/cache/ratelimit', () => ({
  chatRateLimit: { limit: vi.fn() },
  evalRateLimit: { limit: vi.fn() },
  resumeRateLimit: { limit: vi.fn() },
  generalRateLimit: { limit: vi.fn() },
  rateLimit: { limit: vi.fn() },
}));

describe('applyRateLimit utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes successfully when rate limit check passes for chat', async () => {
    vi.mocked(chatRateLimit.limit).mockResolvedValueOnce({
      success: true,
      limit: 60,
      remaining: 59,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    } as never);

    await expect(
      applyRateLimit('user-123', '/api/interview/chat', 'chat'),
    ).resolves.toBeUndefined();
    expect(chatRateLimit.limit).toHaveBeenCalledWith('user-123');
  });

  it('applies resume rate limiter when tier is explicitly resume', async () => {
    vi.mocked(resumeRateLimit.limit).mockResolvedValueOnce({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    } as never);

    await expect(
      applyRateLimit('user-123', '/api/parse-resume', 'resume'),
    ).resolves.toBeUndefined();
    expect(resumeRateLimit.limit).toHaveBeenCalledWith('user-123');
  });

  it('automatically maps /api/interview/evaluate route to eval rate limiter', async () => {
    vi.mocked(evalRateLimit.limit).mockResolvedValueOnce({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    } as never);

    await expect(
      applyRateLimit('user-123', '/api/interview/evaluate'),
    ).resolves.toBeUndefined();
    expect(evalRateLimit.limit).toHaveBeenCalledWith('user-123');
  });

  it('automatically maps /api/parse-resume route to resume rate limiter', async () => {
    vi.mocked(resumeRateLimit.limit).mockResolvedValueOnce({
      success: true,
      limit: 5,
      remaining: 4,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    } as never);

    await expect(
      applyRateLimit('user-123', '/api/parse-resume'),
    ).resolves.toBeUndefined();
    expect(resumeRateLimit.limit).toHaveBeenCalledWith('user-123');
  });

  it('falls back to general rate limiter for unmatched routes', async () => {
    vi.mocked(generalRateLimit.limit).mockResolvedValueOnce({
      success: true,
      limit: 30,
      remaining: 29,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    } as never);

    await expect(
      applyRateLimit('user-123', '/api/other-route'),
    ).resolves.toBeUndefined();
    expect(generalRateLimit.limit).toHaveBeenCalledWith('user-123');
  });

  it('throws RateLimitError when rate limit is exceeded', async () => {
    vi.mocked(resumeRateLimit.limit).mockResolvedValueOnce({
      success: false,
      limit: 5,
      remaining: 0,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    } as never);

    await expect(
      applyRateLimit('user-123', '/api/parse-resume', 'resume'),
    ).rejects.toThrow(RateLimitError);
  });

  it('fails open and logs warning when Redis connection fails', async () => {
    vi.mocked(chatRateLimit.limit).mockRejectedValueOnce(
      new Error('Redis connection refused: ECONNREFUSED'),
    );

    // Should NOT throw an error — fails open
    await expect(
      applyRateLimit('user-123', '/api/interview/chat', 'chat'),
    ).resolves.toBeUndefined();
    expect(chatRateLimit.limit).toHaveBeenCalledWith('user-123');
  });
});
