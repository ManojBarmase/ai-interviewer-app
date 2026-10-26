import { describe, it, expect, vi, beforeEach } from 'vitest';

import { RateLimitError } from '@/server/errors/AppError';
import { rateLimit } from '@/server/integrations/cache/ratelimit';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';

vi.mock('@/server/integrations/cache/ratelimit', () => ({
  rateLimit: {
    limit: vi.fn(),
  },
}));

describe('applyRateLimit utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('completes successfully when rate limit check passes', async () => {
    vi.mocked(rateLimit.limit).mockResolvedValueOnce({
      success: true,
      limit: 10,
      remaining: 9,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    } as never);

    await expect(
      applyRateLimit('user-123', '/api/interview/chat'),
    ).resolves.toBeUndefined();
    expect(rateLimit.limit).toHaveBeenCalledWith('user-123');
  });

  it('throws RateLimitError when rate limit is exceeded', async () => {
    vi.mocked(rateLimit.limit).mockResolvedValueOnce({
      success: false,
      limit: 10,
      remaining: 0,
      reset: Date.now() + 60000,
      pending: Promise.resolve(),
    } as never);

    await expect(
      applyRateLimit('user-123', '/api/interview/chat'),
    ).rejects.toThrow(RateLimitError);
  });

  it('fails open and logs warning when Redis connection fails', async () => {
    vi.mocked(rateLimit.limit).mockRejectedValueOnce(
      new Error('Redis connection refused: ECONNREFUSED'),
    );

    // Should NOT throw an error — fails open
    await expect(
      applyRateLimit('user-123', '/api/interview/chat'),
    ).resolves.toBeUndefined();
    expect(rateLimit.limit).toHaveBeenCalledWith('user-123');
  });
});
