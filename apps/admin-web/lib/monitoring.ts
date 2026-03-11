import * as Sentry from '@sentry/nextjs';

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
    const normalizedError = error instanceof Error
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

export function trackBusinessEvent(eventName: string, context?: MonitoringContext) {
  withSafety(() => {
    Sentry.withScope((scope) => {
      scope.setTag('event_category', 'business');
      if (context && Object.keys(context).length > 0) scope.setContext('context', context);
      Sentry.captureMessage(eventName);
    });
  });
}
