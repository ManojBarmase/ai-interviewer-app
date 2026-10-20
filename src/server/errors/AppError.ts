import 'server-only';

/**
 * Standardized Enterprise Domain Error Hierarchy
 *
 * Provides typed, predictable operational errors with HTTP status codes,
 * machine-readable error codes, and structured metadata.
 */

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, 422, 'VALIDATION_ERROR', details);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: unknown) {
    super(message, 401, 'UNAUTHORIZED', details);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden', details?: unknown) {
    super(message, 403, 'FORBIDDEN', details);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: unknown) {
    super(message, 404, 'NOT_FOUND', details);
  }
}

export class ExternalServiceError extends AppError {
  public readonly serviceName?: string | undefined;

  constructor(
    message = 'External service communication failed',
    serviceName?: string,
    details?: unknown,
  ) {
    super(message, 502, 'EXTERNAL_SERVICE_ERROR', details);
    this.serviceName = serviceName;
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = 'Too many requests. Please wait before trying again.',
    details?: unknown,
  ) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', details);
  }
}
