/**
 * 클라이언트 전용 모니터링 (브라우저 번들용).
 * 'use client' 컴포넌트에서는 이 파일만 import하세요.
 * 서버/API에서는 @/lib/monitoring (@sentry/nextjs)을 사용하세요.
 */
import * as Sentry from '@sentry/react';

type MonitoringContext = Record<string, unknown>;

function withSafety(callback: () => void) {
  try {
    callback();
  } catch {
    // Sentry가 비활성화되었거나 환경이 완전하지 않아도 앱 동작에 영향이 없도록 실패를 침묵 처리합니다.
  }
}

export function captureError(error: unknown, context?: MonitoringContext) {
  withSafety(() => {
    const normalizedError =
      error instanceof Error
        ? error
        : new Error(typeof error === 'string' ? error : JSON.stringify(error));

    if (context && Object.keys(context).length > 0) {
      Sentry.withScope((scope) => {
        scope.setContext('context', context);
        Sentry.captureException(normalizedError);
      });
      return;
    }

    Sentry.captureException(normalizedError);
  });
}
