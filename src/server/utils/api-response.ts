import 'server-only';

import { NextResponse } from 'next/server';

import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';

import { createSessionLogger } from '@/lib/logger';
import { AppError } from '@/server/errors/AppError';

import type { Logger } from 'pino';

export interface ApiResponseOptions {
  headers?: HeadersInit;
  status?: number;
}

/**
 * Standard successful JSON response helper
 */
export function ok<T>(
  data: T,
  status = 200,
  headers?: HeadersInit,
): NextResponse {
  const init: ResponseInit = { status };
  if (headers !== undefined) {
    init.headers = headers;
  }
  return NextResponse.json(data, init);
}

/**
 * Standard failure JSON response helper
 */
export function fail(
  message: string,
  status = 500,
  code = 'INTERNAL_ERROR',
  details?: unknown,
  headers?: HeadersInit,
): NextResponse {
  const payload: Record<string, unknown> = {
    error: message,
    code,
  };

  if (details !== undefined && details !== null) {
    payload.details = details;
  }

  const init: ResponseInit = { status };
  if (headers !== undefined) {
    init.headers = headers;
  }

  return NextResponse.json(payload, init);
}

/**
 * Enterprise centralized API error handler
 *
 * Automatically inspects the error type (AppError, ZodError, or generic Error),
 * logs structured telemetry through Pino, and formats the appropriate HTTP response.
 */
export function handleApiError(
  error: unknown,
  contextOrLogger?:
    | Logger
    | {
        route?: string;
        sessionId?: string;
        userId?: string;
        [key: string]: unknown;
      },
): NextResponse {
  const activeLogger =
    contextOrLogger &&
    'info' in contextOrLogger &&
    typeof contextOrLogger.info === 'function'
      ? (contextOrLogger as Logger)
      : createSessionLogger(
          (contextOrLogger as { sessionId?: string })?.sessionId,
          contextOrLogger as Record<string, unknown>,
        );

  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      activeLogger.error(
        {
          err: error,
          code: error.code,
          statusCode: error.statusCode,
          details: error.details,
        },
        error.message,
      );
    } else {
      activeLogger.warn(
        {
          code: error.code,
          statusCode: error.statusCode,
          details: error.details,
        },
        error.message,
      );
    }

    return fail(error.message, error.statusCode, error.code, error.details);
  }

  if (error instanceof z.ZodError) {
    activeLogger.warn(
      { issues: error.issues },
      'Request payload validation failed',
    );
    return fail('Validation failed', 422, 'VALIDATION_ERROR', error.issues);
  }

  const err = error instanceof Error ? error : new Error(String(error));
  activeLogger.error({ err }, err.message || 'Unhandled internal error');
  Sentry.captureException(err);

  return fail(
    process.env.NODE_ENV === 'production'
      ? 'An unexpected error occurred. Please try again.'
      : err.message || 'An unexpected error occurred.',
    500,
    'INTERNAL_SERVER_ERROR',
  );
}
