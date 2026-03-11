/**
 * Sentry 클라이언트 설정 (관리자·파트너 웹 — 브라우저)
 * Next.js 권장: instrumentation-client.ts (Turbopack 대비)
 * DSN은 공개 키이므로 하드코딩 허용. 환경변수로 재정의 가능.
 */
import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ||
  'https://54c0d0bce0adddd9aacaa9d4b23a2b03@o4510973485580288.ingest.de.sentry.io/4510973489578064';

Sentry.init({
  dsn: SENTRY_DSN,
  environment: process.env.NODE_ENV ?? 'development',

  /** 개발: 100% 트레이스, 프로덕션: 10% 샘플링 */
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  /** 에러 발생 시에만 세션 리플레이 녹화 (관리자 웹은 민감 정보 마스킹 필수) */
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,

  integrations:
    process.env.NODE_ENV === 'production'
      ? [Sentry.replayIntegration({ maskAllText: true, blockAllMedia: true })]
      : [],

  beforeSend(event, hint) {
    const msg = (
      event.message ||
      hint.originalException?.toString() ||
      ''
    ).toLowerCase();
    if (msg.includes('resizeobserver') || msg.includes('script error')) return null;
    return event;
  },
});

/** 라우터 네비게이션 계측 (Sentry 요구) */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
