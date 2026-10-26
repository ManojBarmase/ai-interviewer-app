import type { NextRequest } from 'next/server';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { POST } from '@/app/api/parse-resume/route';
import { RateLimitError, UnauthorizedError } from '@/server/errors/AppError';
import { resumeParserService } from '@/server/services/resume-parser.service';
import { applyRateLimit } from '@/server/utils/apply-rate-limit';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

vi.mock('@/server/utils/auth-guard', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/server/utils/apply-rate-limit', () => ({
  applyRateLimit: vi.fn(),
}));

vi.mock('@/server/services/resume-parser.service', () => ({
  resumeParserService: {
    parseResume: vi.fn(),
  },
}));

function createMockRequest(options: {
  headers?: Record<string, string>;
  formData?: () => Promise<FormData>;
}): NextRequest {
  const headers = new Headers(options.headers ?? {});
  return {
    headers,
    formData: options.formData ?? (() => Promise.resolve(new FormData())),
  } as unknown as NextRequest;
}

describe('POST /api/parse-resume', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValueOnce(
      new UnauthorizedError(
        'Unauthorized. Authentication required to access this endpoint.',
      ),
    );

    const req = createMockRequest({});
    const res = await POST(req);

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe('UNAUTHORIZED');
    expect(applyRateLimit).not.toHaveBeenCalled();
    expect(resumeParserService.parseResume).not.toHaveBeenCalled();
  });

  it('returns 429 when rate limit is exceeded on resume tier', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-candidate-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(applyRateLimit).mockRejectedValueOnce(
      new RateLimitError('Too many requests. Please wait before trying again.'),
    );

    const req = createMockRequest({});
    const res = await POST(req);

    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(applyRateLimit).toHaveBeenCalledWith(
      'user-candidate-1',
      '/api/parse-resume',
      'resume',
    );
    expect(resumeParserService.parseResume).not.toHaveBeenCalled();
  });

  it('returns 413 when content-length exceeds 5MB limit', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-candidate-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);

    const oversizedLength = (6 * 1024 * 1024).toString();
    const req = createMockRequest({
      headers: { 'content-length': oversizedLength },
    });
    const res = await POST(req);

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.code).toBe('PAYLOAD_TOO_LARGE');
    expect(resumeParserService.parseResume).not.toHaveBeenCalled();
  });

  it('returns 400 when formData parsing fails', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-candidate-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);

    const req = createMockRequest({
      formData: () => Promise.reject(new Error('Malformed multipart body')),
    });
    const res = await POST(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
    expect(body.error).toBe('Invalid form data submission');
  });

  it('successfully parses resume when authenticated and within limits', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-candidate-1',
      role: 'CANDIDATE',
      isDemo: false,
    });
    vi.mocked(applyRateLimit).mockResolvedValueOnce(undefined);

    const mockParsedResult = {
      text: 'Extracted resume content with 5 years React experience',
      bytesParsed: 1024,
      characterCount: 52,
    };
    vi.mocked(resumeParserService.parseResume).mockResolvedValueOnce(
      mockParsedResult,
    );

    const mockFormData = new FormData();
    const mockFile = new File(['dummy content'], 'resume.pdf', {
      type: 'application/pdf',
    });
    mockFormData.append('file', mockFile);

    const req = createMockRequest({
      formData: () => Promise.resolve(mockFormData),
    });
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(mockParsedResult);
    expect(applyRateLimit).toHaveBeenCalledWith(
      'user-candidate-1',
      '/api/parse-resume',
      'resume',
    );
    expect(resumeParserService.parseResume).toHaveBeenCalledWith(mockFile);
  });
});
