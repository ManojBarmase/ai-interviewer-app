import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_APP_ENV || 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0.1,
});
