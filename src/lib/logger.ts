import pino from 'pino';

import { env } from '@/lib/config/env';

/**
 * Enterprise Structured Logger using Pino.
 * Emits JSON-formatted structured logs with timestamps and log levels.
 */
export const logger = pino({
  level: env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  browser: {
    asObject: true,
  },
});

/**
 * Creates a contextual child logger with a bound sessionId.
 * All subsequent log calls will automatically include { sessionId, ...context }.
 *
 * @param sessionId - The interview or evaluation session identifier
 * @param extraContext - Additional metadata like userId, route, etc.
 */
export function createSessionLogger(
  sessionId?: string,
  extraContext?: Record<string, unknown>,
) {
  return logger.child({
    sessionId: sessionId || 'anonymous-session',
    ...extraContext,
  });
}
