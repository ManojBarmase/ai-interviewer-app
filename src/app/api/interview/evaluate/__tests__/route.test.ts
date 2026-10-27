import type { NextRequest } from 'next/server';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { POST } from '@/app/api/interview/evaluate/route';
import { UnauthorizedError } from '@/server/errors/AppError';
import { evaluationService } from '@/server/services/evaluation.service';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';
import {
  checkAndLockIdempotencyKey,
  storeIdempotentResponse,
  releaseIdempotencyKey,
} from '@/server/utils/idempotency';

vi.mock('@/server/utils/auth-guard', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/server/utils/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/server/services/evaluation.service', () => ({
  evaluationService: {
    evaluateInterview: vi.fn(),
  },
}));

vi.mock('@/server/utils/idempotency', () => ({
  checkAndLockIdempotencyKey: vi.fn(),
  storeIdempotentResponse: vi.fn(),
  releaseIdempotencyKey: vi.fn(),
}));

function createMockRequest(
  body?: unknown,
  headers: Record<string, string> = {},
): NextRequest {
  const headerMap = new Map<string, string>();
  for (const [k, v] of Object.entries(headers)) {
    headerMap.set(k.toLowerCase(), v);
  }

  return {
    json: async () => body,
    headers: {
      get: (key: string) => headerMap.get(key.toLowerCase()) ?? null,
    },
  } as unknown as NextRequest;
}

describe('POST /api/interview/evaluate (with Idempotency)', () => {
  const mockAuthUser = {
    userId: 'user-candidate-1',
    email: 'candidate@test.com',
    firstName: 'Candidate',
    role: 'CANDIDATE' as const,
    isDemo: false,
  };

  const mockEvaluationResult = {
    technicalScore: 8,
    communicationScore: 9,
    problemSolvingScore: 8,
    deliveryScore: 8,
    cultureFitScore: 8,
    overallScore: 8.3,
    strongAreas: ['React'],
    weakAreas: ['CSS'],
    actionableFeedback: 'Great communication',
    recommendation: 'YES' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValueOnce(
      new UnauthorizedError('Unauthorized. Please sign in.'),
    );

    const res = await POST(createMockRequest({ transcript: 'test' }));
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.code).toBe('UNAUTHORIZED');
  });

  it('processes evaluation normally without idempotency check when header is missing', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(mockAuthUser);
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);
    vi.mocked(evaluationService.evaluateInterview).mockResolvedValueOnce(
      mockEvaluationResult as never,
    );

    const res = await POST(
      createMockRequest({ transcript: 'Hello candidate' }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.evaluation.technicalScore).toBe(8);
    expect(res.headers.get('X-Cache-Lookup')).toBeNull();
    expect(checkAndLockIdempotencyKey).not.toHaveBeenCalled();
    expect(storeIdempotentResponse).not.toHaveBeenCalled();
  });

  it('returns cached response immediately with X-Cache-Lookup: HIT on cache HIT', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(mockAuthUser);
    const cachedPayload = {
      success: true,
      evaluation: mockEvaluationResult,
    };

    vi.mocked(checkAndLockIdempotencyKey).mockResolvedValueOnce({
      cachedResponse: cachedPayload,
    });

    const res = await POST(
      createMockRequest(
        { transcript: 'Hello candidate' },
        { 'Idempotency-Key': 'key-abc-123' },
      ),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('X-Cache-Lookup')).toBe('HIT');
    const data = await res.json();
    expect(data).toEqual(cachedPayload);

    // Evaluation service should NOT have been invoked
    expect(evaluationService.evaluateInterview).not.toHaveBeenCalled();
    expect(applyRateLimit).not.toHaveBeenCalled();
  });

  it('returns 409 CONFLICT when request with same idempotency key is already in progress', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(mockAuthUser);
    vi.mocked(checkAndLockIdempotencyKey).mockResolvedValueOnce({
      inProgress: true,
    });

    const res = await POST(
      createMockRequest(
        { transcript: 'Hello candidate' },
        { 'X-Idempotency-Key': 'key-duplicate' },
      ),
    );

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.code).toBe('CONFLICT');
    expect(data.error).toContain('already in progress');
    expect(evaluationService.evaluateInterview).not.toHaveBeenCalled();
    // Conflict should NOT release the key
    expect(releaseIdempotencyKey).not.toHaveBeenCalled();
  });

  it('executes evaluation and stores payload on cache MISS with idempotency key', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(mockAuthUser);
    vi.mocked(checkAndLockIdempotencyKey).mockResolvedValueOnce({
      inProgress: false,
    });
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);
    vi.mocked(evaluationService.evaluateInterview).mockResolvedValueOnce(
      mockEvaluationResult as never,
    );

    const res = await POST(
      createMockRequest(
        { sessionId: 'sess-1', transcript: 'Hello candidate' },
        { 'Idempotency-Key': 'key-new-123' },
      ),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);

    expect(checkAndLockIdempotencyKey).toHaveBeenCalledWith('key-new-123');
    expect(storeIdempotentResponse).toHaveBeenCalledWith(
      'key-new-123',
      expect.objectContaining({
        success: true,
        evaluation: mockEvaluationResult,
      }),
    );
  });

  it('releases idempotency lock when evaluation throws an unexpected error', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce(mockAuthUser);
    vi.mocked(checkAndLockIdempotencyKey).mockResolvedValueOnce({
      inProgress: false,
    });
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);
    vi.mocked(evaluationService.evaluateInterview).mockRejectedValueOnce(
      new Error('LLM service crashed'),
    );

    const res = await POST(
      createMockRequest(
        { sessionId: 'sess-1', transcript: 'Hello' },
        { 'Idempotency-Key': 'key-will-fail' },
      ),
    );

    expect(res.status).toBe(500);
    expect(releaseIdempotencyKey).toHaveBeenCalledWith('key-will-fail');
  });
});
