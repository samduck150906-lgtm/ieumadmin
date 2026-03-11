/**
 * Next.js Instrumentation — Sentry 서버/엣지 등록
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/** Server Components / middleware / proxy 에러를 Sentry로 전달 */
export const onRequestError = Sentry.captureRequestError;
