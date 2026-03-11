'use client';

import { useEffect } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';

function formatErrorForDisplay(error: Error & { digest?: string }): string {
  const parts: string[] = [];
  if (error?.name) parts.push(`[${error.name}]`);
  if (error?.message) parts.push(error.message);
  if (error?.digest) parts.push(`digest: ${error.digest}`);
  if (error?.stack) parts.push(`\n${error.stack}`);
  return parts.join(' ') || '알 수 없는 오류';
}

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Route error:', error);
  }, [error]);

  const errorDisplay = formatErrorForDisplay(error);
  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-lg w-full bg-white rounded-2xl shadow-lg p-8 text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-8 h-8 text-red-600" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          서버와 통신 중 오류가 발생했습니다
        </h1>
        <p className="text-gray-500 mb-6">
          잠시 후 다시 시도해 주세요.
        </p>

        {isDev && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 text-left">
            <p className="text-xs font-semibold text-amber-800 mb-2">에러 로그 (개발 모드)</p>
            <pre className="text-xs text-gray-700 font-mono break-all whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
              {errorDisplay}
            </pre>
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
          >
            <RefreshCw className="w-4 h-4" aria-hidden />
            다시 시도
          </button>
          <Link
            href="/"
            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200"
          >
            <Home className="w-4 h-4" aria-hidden />
            홈으로
          </Link>
        </div>
      </div>
    </div>
  );
}
