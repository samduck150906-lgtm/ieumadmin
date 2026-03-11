'use client';

/**
 * Next.js App Router 전역 에러 경계 (관리자·파트너 웹)
 * root layout 바깥에서 발생하는 치명적 에러를 Sentry로 수집
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error, {
      tags: { source: 'global-error-boundary', app: 'admin-web' },
      extra: { digest: error.digest },
    });
  }, [error]);

  return (
    <html lang="ko">
      <body>
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            fontFamily: 'system-ui, sans-serif',
            backgroundColor: '#f9fafb',
          }}
        >
          <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, color: '#111827' }}>
            서버와 통신 중 오류가 발생했습니다
          </h1>
          <p style={{ color: '#6b7280', marginBottom: 24, textAlign: 'center' }}>
            잠시 후 다시 시도해 주세요.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: '12px 24px',
              backgroundColor: '#2563eb',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontWeight: 600,
              cursor: 'pointer',
              fontSize: 16,
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
