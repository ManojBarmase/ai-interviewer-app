import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  chatMessageSchema,
  candidateContextSchema,
  chatRequestSchema,
  type ChatRequest,
} from '@/lib/validations/chat';
import {
  ExternalServiceError,
  ValidationError,
} from '@/server/errors/AppError';
import {
  ChatService,
  chatService,
  validateChatRequest,
  sseFrame,
  sseHeaders,
} from '@/server/services/chat.service';

vi.mock('@/lib/config/env', () => ({
  env: {
    get GROQ_API_KEY() {
      const val = process.env.GROQ_API_KEY;
      return !val || val === 'undefined' ? undefined : val;
    },
    NODE_ENV: 'test',
  },
}));

vi.mock('groq-sdk', () => {
  return {
    default: class MockGroq {
      chat = {
        completions: {
          create: vi.fn().mockResolvedValue({
            async *[Symbol.asyncIterator]() {
              yield { choices: [{ delta: { content: 'Hello candidate' } }] };
            },
          }),
        },
      };
    },
  };
});

describe('Chat Validation Schemas', () => {
  describe('chatMessageSchema', () => {
    it('validates user and model roles successfully', () => {
      expect(
        chatMessageSchema.safeParse({ role: 'user', content: 'Hello' }).success,
      ).toBe(true);
      expect(
        chatMessageSchema.safeParse({ role: 'model', content: 'Hi there' })
          .success,
      ).toBe(true);
    });

    it('rejects unsupported roles', () => {
      expect(
        chatMessageSchema.safeParse({ role: 'system', content: 'System note' })
          .success,
      ).toBe(false);
      expect(
        chatMessageSchema.safeParse({
          role: 'assistant',
          content: 'Assistant note',
        }).success,
      ).toBe(false);
    });

    it('rejects empty content or content exceeding 8000 chars', () => {
      expect(
        chatMessageSchema.safeParse({ role: 'user', content: '' }).success,
      ).toBe(false);
      expect(
        chatMessageSchema.safeParse({
          role: 'user',
          content: 'x'.repeat(8001),
        }).success,
      ).toBe(false);
    });
  });

  describe('candidateContextSchema', () => {
    it('accepts valid context with all optional fields', () => {
      const parsed = candidateContextSchema.safeParse({
        role: 'Full Stack Engineer',
        experience: 'Senior',
        difficulty: 'Hard',
        interviewType: 'TECHNICAL',
        techStack: ['TypeScript', 'React'],
        jobDescription: 'Seeking expert developer',
        resumeText: 'Experienced with Next.js',
        interviewerId: 'alex',
        numQuestions: 5,
        timeLimit: '30m',
        allowFollowUps: true,
      });

      expect(parsed.success).toBe(true);
    });

    it('allows empty object as candidateContext', () => {
      expect(candidateContextSchema.safeParse({}).success).toBe(true);
    });
  });

  describe('chatRequestSchema', () => {
    it('parses valid payload successfully', () => {
      const res = chatRequestSchema.safeParse({
        sessionId: 'sess-abc-123',
        messages: [{ role: 'user', content: 'Hello' }],
        interviewType: 'TECHNICAL',
      });
      expect(res.success).toBe(true);
    });

    it('rejects when messages is empty', () => {
      const res = chatRequestSchema.safeParse({
        sessionId: 'sess-abc-123',
        messages: [],
      });
      expect(res.success).toBe(false);
    });

    it('rejects when messages exceed 50 items', () => {
      const messages = Array.from({ length: 51 }, () => ({
        role: 'user' as const,
        content: 'ping',
      }));
      const res = chatRequestSchema.safeParse({
        sessionId: 'sess-abc-123',
        messages,
      });
      expect(res.success).toBe(false);
    });
  });
});

describe('ChatService & SSE Utilities', () => {
  const originalGroqKey = process.env.GROQ_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GROQ_API_KEY = 'gsk_test_mock_key';
  });

  afterEach(() => {
    process.env.GROQ_API_KEY = originalGroqKey;
  });

  describe('validateChatRequest', () => {
    const validPayload: ChatRequest = {
      sessionId: 'sess-123',
      messages: [
        { role: 'user', content: 'Hello' },
        { role: 'model', content: 'Hi, how are you?' },
      ],
    };

    it('throws ValidationError when body is not an object', () => {
      expect(() => validateChatRequest(null)).toThrow(ValidationError);
      expect(() => validateChatRequest(undefined)).toThrow(ValidationError);
      expect(() => validateChatRequest('not-an-object')).toThrow(
        ValidationError,
      );
      expect(() => validateChatRequest(12345)).toThrow(ValidationError);
    });

    it('throws ValidationError when messages array is empty', () => {
      expect(() =>
        validateChatRequest({
          sessionId: 'sess-123',
          messages: [],
        }),
      ).toThrow(ValidationError);
    });

    it('throws ValidationError when messages exceed 50 turns', () => {
      const messages = Array.from({ length: 51 }, (_, i) => ({
        role: (i % 2 === 0 ? 'user' : 'model') as 'user' | 'model',
        content: `Message turn ${i}`,
      }));

      expect(() =>
        validateChatRequest({
          sessionId: 'sess-123',
          messages,
        }),
      ).toThrow(ValidationError);
    });

    it('throws ValidationError when a message has invalid role (not "user" or "model")', () => {
      expect(() =>
        validateChatRequest({
          sessionId: 'sess-123',
          messages: [
            {
              role: 'system',
              content: 'Invalid role',
            },
          ],
        }),
      ).toThrow(ValidationError);

      expect(() =>
        validateChatRequest({
          sessionId: 'sess-123',
          messages: [
            {
              role: 'assistant',
              content: 'Invalid role',
            },
          ],
        }),
      ).toThrow(ValidationError);
    });

    it('throws ValidationError when a message content is empty string', () => {
      expect(() =>
        validateChatRequest({
          sessionId: 'sess-123',
          messages: [
            {
              role: 'user',
              content: '',
            },
          ],
        }),
      ).toThrow(ValidationError);
    });

    it('throws ValidationError when a message content exceeds 8000 characters', () => {
      expect(() =>
        validateChatRequest({
          sessionId: 'sess-123',
          messages: [
            {
              role: 'user',
              content: 'x'.repeat(8001),
            },
          ],
        }),
      ).toThrow(ValidationError);
    });

    it('throws ValidationError when sessionId is missing or empty', () => {
      expect(() =>
        validateChatRequest({
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).toThrow(ValidationError);

      expect(() =>
        validateChatRequest({
          sessionId: '',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).toThrow(ValidationError);

      expect(() =>
        validateChatRequest({
          sessionId: '   ',
          messages: [{ role: 'user', content: 'Hello' }],
        }),
      ).toThrow(ValidationError);
    });

    it('returns valid ChatRequest when all fields are correct', () => {
      const result = validateChatRequest(validPayload);
      expect(result.sessionId).toBe('sess-123');
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('accepts optional interviewType field', () => {
      const result = validateChatRequest({
        ...validPayload,
        interviewType: 'TECHNICAL',
      });
      expect(result.interviewType).toBe('TECHNICAL');
    });

    it('accepts optional candidateContext field', () => {
      const candidateContext = {
        role: 'Full Stack Engineer',
        experience: 'Senior',
        techStack: ['TypeScript', 'Next.js'],
      };

      const result = validateChatRequest({
        ...validPayload,
        candidateContext,
      });
      expect(result.candidateContext).toEqual(candidateContext);
    });

    it('populates ValidationError metadata with 422 status, code, and issues', () => {
      try {
        validateChatRequest({
          sessionId: '',
          messages: [],
        });
        expect.unreachable('Should have thrown ValidationError');
      } catch (err) {
        expect(err).toBeInstanceOf(ValidationError);
        const valErr = err as ValidationError;
        expect(valErr.statusCode).toBe(422);
        expect(valErr.code).toBe('VALIDATION_ERROR');
        expect(Array.isArray(valErr.details)).toBe(true);
        expect((valErr.details as unknown[]).length).toBeGreaterThan(0);
      }
    });
  });

  describe('sseFrame', () => {
    const decoder = new TextDecoder();

    it('returns a Uint8Array', () => {
      const frame = sseFrame({ type: 'chunk', text: 'sample' });
      expect(frame.constructor.name).toBe('Uint8Array');
      expect(ArrayBuffer.isView(frame)).toBe(true);
    });

    it('encoded data starts with "data: "', () => {
      const frame = sseFrame({ type: 'chunk', text: 'test' });
      const decoded = decoder.decode(frame);
      expect(decoded.startsWith('data: ')).toBe(true);
    });

    it('encoded data ends with "\\n\\n"', () => {
      const frame = sseFrame({ type: 'chunk', text: 'test' });
      const decoded = decoder.decode(frame);
      expect(decoded.endsWith('\n\n')).toBe(true);
    });

    it('correctly serializes a chunk event', () => {
      const frame = sseFrame({
        type: 'chunk',
        text: 'Partial stream response',
      });
      const decoded = decoder.decode(frame);
      expect(decoded).toBe(
        'data: {"type":"chunk","text":"Partial stream response"}\n\n',
      );
    });

    it('correctly serializes a done event', () => {
      const frame = sseFrame({ type: 'done' });
      const decoded = decoder.decode(frame);
      expect(decoded).toBe('data: {"type":"done"}\n\n');
    });

    it('correctly serializes an error event', () => {
      const frame = sseFrame({
        type: 'error',
        code: 'TIMEOUT',
        message: 'The AI took too long to respond.',
      });
      const decoded = decoder.decode(frame);
      expect(decoded).toBe(
        'data: {"type":"error","code":"TIMEOUT","message":"The AI took too long to respond."}\n\n',
      );
    });
  });

  describe('sseHeaders', () => {
    it('returns Headers with Content-Type: text/event-stream; charset=utf-8', () => {
      const headers = sseHeaders();
      expect(headers.get('Content-Type')).toBe(
        'text/event-stream; charset=utf-8',
      );
    });

    it('returns Headers with Cache-Control: no-cache, no-transform', () => {
      const headers = sseHeaders();
      expect(headers.get('Cache-Control')).toBe('no-cache, no-transform');
    });

    it('returns Headers with Connection: keep-alive', () => {
      const headers = sseHeaders();
      expect(headers.get('Connection')).toBe('keep-alive');
    });

    it('merges extra headers passed as argument', () => {
      const headers = sseHeaders({
        'X-Custom-Telemetry': 'ai-interviewer-v1',
      });
      expect(headers.get('X-Custom-Telemetry')).toBe('ai-interviewer-v1');
      expect(headers.get('Content-Type')).toBe(
        'text/event-stream; charset=utf-8',
      );
    });
  });

  describe('ChatService.createStream', () => {
    const validChatRequest: ChatRequest = {
      sessionId: 'session-456',
      messages: [{ role: 'user', content: 'What is memoization?' }],
    };

    it('throws ExternalServiceError when GROQ_API_KEY is not set', () => {
      process.env.GROQ_API_KEY = undefined;
      const service = new ChatService();

      expect(() => service.createStream(validChatRequest, 'user-123')).toThrow(
        ExternalServiceError,
      );
    });

    it('creates a ReadableStream when GROQ_API_KEY is configured', () => {
      process.env.GROQ_API_KEY = 'gsk_valid_key';
      const service = new ChatService();

      const stream = service.createStream(validChatRequest, 'user-123');
      expect(stream).toBeInstanceOf(ReadableStream);
    });

    it('verifies default singleton export exists', () => {
      expect(chatService).toBeInstanceOf(ChatService);
    });
  });
});
