'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';

/**
 * API 실패 시 fallback UI
 * - 500/401/403 별도 메시지 권장
 * - 재시도 버튼 제공
 */
export function ApiFallback({
  message,
  status,
  onRetry,
}: {
  message: string;
  status?: number;
  onRetry?: () => void;
}) {
  const displayMessage =
    status === 401
      ? '로그인이 필요합니다. 다시 로그인해 주세요.'
      : status === 403
        ? '접근 권한이 없습니다.'
        : status && status >= 500
          ? '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'
          : message;

  return (
    <div
      className="rounded-xl border bg-red-50 border-red-200 p-4 flex items-center gap-3"
      role="alert"
    >
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
      <p className="text-red-700 flex-1">{displayMessage}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <RefreshCw className="w-4 h-4" />
            재시도
          </span>
        </button>
      )}
    </div>
  );
}
