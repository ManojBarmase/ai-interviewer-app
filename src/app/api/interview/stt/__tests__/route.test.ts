import type { NextRequest } from 'next/server';

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { POST } from '@/app/api/interview/stt/route';
import { UnauthorizedError } from '@/server/errors/AppError';
import { groq } from '@/server/integrations/ai/groq.client';
import { getAuthenticatedUser } from '@/server/utils/auth-guard';

vi.mock('@/server/utils/auth-guard', () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('@/server/integrations/ai/groq.client', () => ({
  groq: {
    audio: {
      transcriptions: {
        create: vi.fn(),
      },
    },
  },
}));

function createMockFormDataRequest(file?: File | null): NextRequest {
  const formData = new FormData();
  if (file) {
    formData.append('file', file);
  }
  return {
    formData: async () => formData,
  } as unknown as NextRequest;
}

describe('POST /api/interview/stt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is unauthenticated', async () => {
    vi.mocked(getAuthenticatedUser).mockRejectedValueOnce(
      new UnauthorizedError('Unauthorized. Please sign in.'),
    );

    const req = createMockFormDataRequest();
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('returns 400 when no audio file is provided', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });

    const req = createMockFormDataRequest(null);
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe('BAD_REQUEST');
  });

  it('transcribes audio using Groq Whisper Large v3 Turbo and returns text', async () => {
    vi.mocked(getAuthenticatedUser).mockResolvedValueOnce({
      userId: 'user-1',
      role: 'CANDIDATE',
      isDemo: false,
    });

    const dummyFile = new File(['fake-audio-bytes'], 'test.webm', {
      type: 'audio/webm',
    });

    vi.mocked(groq.audio.transcriptions.create).mockResolvedValueOnce({
      text: 'I have designed distributed microservices using Kafka and Redis.',
    } as unknown as Awaited<
      ReturnType<typeof groq.audio.transcriptions.create>
    >);

    const req = createMockFormDataRequest(dummyFile);
    const res = await POST(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.text).toBe(
      'I have designed distributed microservices using Kafka and Redis.',
    );
    expect(body.provider).toBe('groq-whisper-large-v3-turbo');
  });
});
