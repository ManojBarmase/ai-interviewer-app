import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RateLimitError } from '@/server/errors/AppError';
import {
  chatRateLimit,
  evalRateLimit,
  generalRateLimit,
  rateLimit,
  resumeRateLimit,
} from '@/server/integrations/cache/ratelimit';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';

describe('Ratelimit Infrastructure Module', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rate Limiter Configurations', () => {
    it('initializes all tiered rate limiters with expected prefixes', () => {
      const getPrefix = (limiter: unknown) =>
        (limiter as { prefix: string }).prefix;

      expect(getPrefix(chatRateLimit)).toBe('@upstash/ratelimit:chat');
      expect(getPrefix(evalRateLimit)).toBe('@upstash/ratelimit:eval');
      expect(getPrefix(resumeRateLimit)).toBe('@upstash/ratelimit:resume');
      expect(getPrefix(generalRateLimit)).toBe('@upstash/ratelimit:general');
    });

    it('aliases generalRateLimit as rateLimit for backward compatibility', () => {
      const getPrefix = (limiter: unknown) =>
        (limiter as { prefix: string }).prefix;

      expect(rateLimit).toBe(generalRateLimit);
      expect(getPrefix(rateLimit)).toBe('@upstash/ratelimit:general');
    });
  });

  describe('Sliding-window Rate Limit Success and Rejection', () => {
    it('allows requests when within sliding window limit', async () => {
      const mockSuccessResult = {
        success: true,
        limit: 60,
        remaining: 59,
        reset: Date.now() + 60000,
        pending: Promise.resolve(),
      };

      vi.spyOn(chatRateLimit, 'limit').mockResolvedValueOnce(
        mockSuccessResult as never,
      );

      const result = await chatRateLimit.limit('user-session-123');
      expect(result.success).toBe(true);
      expect(result.remaining).toBe(59);
      expect(chatRateLimit.limit).toHaveBeenCalledWith('user-session-123');
    });

    it('rejects requests when rate limit threshold is exceeded', async () => {
      const mockExceededResult = {
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 30000,
        pending: Promise.resolve(),
      };

      vi.spyOn(evalRateLimit, 'limit').mockResolvedValueOnce(
        mockExceededResult as never,
      );

      const result = await evalRateLimit.limit('user-session-eval-busy');
      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(evalRateLimit.limit).toHaveBeenCalledWith(
        'user-session-eval-busy',
      );
    });

    it('correctly reports rejection across resume and general limiters', async () => {
      const mockBlockedResult = {
        success: false,
        limit: 5,
        remaining: 0,
        reset: Date.now() + 15000,
        pending: Promise.resolve(),
      };

      vi.spyOn(resumeRateLimit, 'limit').mockResolvedValueOnce(
        mockBlockedResult as never,
      );
      vi.spyOn(generalRateLimit, 'limit').mockResolvedValueOnce(
        mockBlockedResult as never,
      );

      const resumeRes = await resumeRateLimit.limit('resume-candidate-1');
      expect(resumeRes.success).toBe(false);

      const generalRes = await generalRateLimit.limit('gen-client-1');
      expect(generalRes.success).toBe(false);
    });
  });

  describe('Fallback Behavior When Redis is Unreachable', () => {
    it('propagates Redis connection failure error from raw rate limiter', async () => {
      vi.spyOn(chatRateLimit, 'limit').mockRejectedValueOnce(
        new Error('Upstash KV connection timeout: ETIMEDOUT'),
      );

      await expect(
        chatRateLimit.limit('user-failing-connection'),
      ).rejects.toThrow('Upstash KV connection timeout: ETIMEDOUT');
    });

    it('fails open gracefully when used via applyRateLimit during Redis outage', async () => {
      vi.spyOn(chatRateLimit, 'limit').mockRejectedValueOnce(
        new Error('Upstash Redis cluster unreachable'),
      );

      // Fails open without throwing an exception
      await expect(
        applyRateLimit('user-failopen-id', '/api/interview/chat', 'chat'),
      ).resolves.toBeUndefined();
    });

    it('fails open for evaluation tier when Redis is down', async () => {
      vi.spyOn(evalRateLimit, 'limit').mockRejectedValueOnce(
        new Error('Redis socket hang up ECONNRESET'),
      );

      await expect(
        applyRateLimit('user-eval-failopen', '/api/interview/evaluate', 'eval'),
      ).resolves.toBeUndefined();
    });

    it('fails open for resume parser tier when Redis is down', async () => {
      vi.spyOn(resumeRateLimit, 'limit').mockRejectedValueOnce(
        new Error('Connection refused: 127.0.0.1:6379'),
      );

      await expect(
        applyRateLimit('user-resume-failopen', '/api/parse-resume', 'resume'),
      ).resolves.toBeUndefined();
    });

    it('does NOT fail open if rate limit was legitimately exceeded (throws RateLimitError)', async () => {
      vi.spyOn(generalRateLimit, 'limit').mockResolvedValueOnce({
        success: false,
        limit: 30,
        remaining: 0,
        reset: Date.now() + 60000,
        pending: Promise.resolve(),
      } as never);

      await expect(
        applyRateLimit('user-exceeded', '/api/other-route', 'general'),
      ).rejects.toThrow(RateLimitError);
    });
  });
});
