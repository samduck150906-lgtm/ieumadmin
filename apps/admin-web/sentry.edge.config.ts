/**
 * Sentry Edge 런타임 설정 (관리자·파트너 웹 — Edge Middleware / Edge API Routes)
 */
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  process.env.SENTRY_DSN ||
  'https://54c0d0bce0adddd9aacaa9d4b23a2b03@o4510973485580288.ingest.de.sentry.io/4510973489578064';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
});
