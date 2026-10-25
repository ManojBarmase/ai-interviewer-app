import * as Sentry from '@sentry/nextjs';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

import { AppError, BadRequestError } from '@/server/errors/AppError';
import { ok, fail, handleApiError } from '@/server/utils/api-response';

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
}));

describe('api-response utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ok helper', () => {
    it('creates a 200 JSON response by default', async () => {
      const res = ok({ success: true, count: 1 });
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data).toEqual({ success: true, count: 1 });
    });

    it('respects custom status and headers', async () => {
      const res = ok({ created: true }, 201, { 'X-Custom-Header': 'val' });
      expect(res.status).toBe(201);
      expect(res.headers.get('X-Custom-Header')).toBe('val');
    });
  });

  describe('fail helper', () => {
    it('creates a 500 error response by default', async () => {
      const res = fail('Something went wrong');
      expect(res.status).toBe(500);

      const body = await res.json();
      expect(body).toEqual({
        error: 'Something went wrong',
        code: 'INTERNAL_ERROR',
      });
    });

    it('attaches error code and details', async () => {
      const res = fail('Invalid payload', 400, 'INVALID_INPUT', {
        field: 'email',
      });
      expect(res.status).toBe(400);

      const body = await res.json();
      expect(body).toEqual({
        error: 'Invalid payload',
        code: 'INVALID_INPUT',
        details: { field: 'email' },
      });
    });
  });

  describe('handleApiError', () => {
    it('handles AppError with client status (< 500)', async () => {
      const appErr = new BadRequestError('Bad input provided');
      const res = handleApiError(appErr);

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('BAD_REQUEST');
      expect(data.error).toBe('Bad input provided');
    });

    it('handles AppError with server status (>= 500)', async () => {
      const appErr = new AppError('Database exploded', 503, 'DB_UNAVAILABLE');
      const res = handleApiError(appErr);

      expect(res.status).toBe(503);
      const data = await res.json();
      expect(data.code).toBe('DB_UNAVAILABLE');
    });

    it('handles ZodError by formatting 422 with issues', async () => {
      const schema = z.object({ email: z.string().email() });
      const parseResult = schema.safeParse({ email: 'not-an-email' });

      if (!parseResult.success) {
        const res = handleApiError(parseResult.error);
        expect(res.status).toBe(422);

        const data = await res.json();
        expect(data.code).toBe('VALIDATION_ERROR');
        expect(data.details).toBeDefined();
      }
    });

    it('handles unhandled generic errors with 500 and reports to Sentry', async () => {
      const genericError = new Error('Catastrophic unexpected failure');
      const res = handleApiError(genericError);

      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.code).toBe('INTERNAL_SERVER_ERROR');
      expect(Sentry.captureException).toHaveBeenCalledWith(genericError);
    });

    it('handles string/unknown errors and reports to Sentry', async () => {
      const res = handleApiError('Plain string error thrown');

      expect(res.status).toBe(500);
      expect(Sentry.captureException).toHaveBeenCalled();
    });
  });
});
