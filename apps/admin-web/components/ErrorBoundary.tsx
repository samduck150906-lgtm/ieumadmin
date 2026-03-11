'use client';

import React, { Component, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Link from 'next/link';
import { captureError } from '@/lib/monitoring.client';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  showDetails?: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('에러 발생:', error, errorInfo);
    captureError(error, {
      area: 'admin-web ErrorBoundary',
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              서버와 통신 중 오류가 발생했습니다
            </h1>
            <p className="text-gray-500 mb-6">
              잠시 후 다시 시도해 주세요.
            </p>
            
            {this.state.error && (
              <>
                {(process.env.NODE_ENV === 'development' || this.state.showDetails) ? (
                  <div className="bg-gray-100 rounded-lg p-4 mb-6 text-left">
                    <p className="text-xs text-gray-500 font-mono break-all">
                      {this.state.error.message}
                    </p>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => this.setState({ showDetails: true })}
                    className="mb-4 text-sm text-gray-500 underline hover:text-gray-700"
                  >
                    자세한 에러 메시지 보기
                  </button>
                )}
              </>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => window.location.reload()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
              >
                <RefreshCw className="w-4 h-4" />
                새로고침
              </button>
              <Link
                href="/dashboard"
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold hover:bg-gray-200"
              >
                <Home className="w-4 h-4" />
                홈으로
              </Link>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * 페이지 로딩 컴포넌트
 */
export function PageLoading({ message = '로딩 중...' }: { message?: string }) {
  return (
    <div className="min-h-[400px] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">{message}</p>
      </div>
    </div>
  );
}

/**
 * 빈 상태 컴포넌트
 */
export function EmptyState({
  icon: Icon = AlertTriangle,
  title = '데이터가 없습니다',
  description,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12">
      <Icon className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      {description && <p className="text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  );
}

/**
 * 에러 메시지 컴포넌트
 */
export function ErrorMessage({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
      <p className="text-red-700 flex-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-3 py-1 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200"
        >
          재시도
        </button>
      )}
    </div>
  );
}
