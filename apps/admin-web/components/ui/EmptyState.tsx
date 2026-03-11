'use client';

import type { ReactNode } from 'react';
import { Inbox, RefreshCw } from 'lucide-react';
import { Button } from './Button';

export type EmptyStateVariant = 'default' | 'no-data';

export interface EmptyStateProps {
  /** 제목 (no-data일 때 기본: "데이터가 없습니다") */
  title?: string;
  description?: string;
  icon?: ReactNode;
  /** 커스텀 액션 영역 */
  action?: ReactNode;
  /** 'no-data': 데이터 없음 전용 UI(기본 아이콘 + 재시도 버튼 옵션) */
  variant?: EmptyStateVariant;
  /** 재시도 클릭 시 호출. variant="no-data"이면 "다시 시도" 버튼 표시 */
  onRetry?: () => void;
}

const DEFAULT_NO_DATA_TITLE = '데이터가 없습니다';
const DEFAULT_NO_DATA_DESCRIPTION =
  '조건에 맞는 항목이 없거나 아직 등록된 데이터가 없습니다.';

export default function EmptyState({
  title,
  description,
  icon,
  action,
  variant = 'default',
  onRetry,
}: EmptyStateProps) {
  const isNoData = variant === 'no-data';
  const displayTitle = title ?? DEFAULT_NO_DATA_TITLE;
  const displayDescription =
    description ?? (isNoData ? DEFAULT_NO_DATA_DESCRIPTION : undefined);
  const displayIcon = icon ?? (isNoData ? <Inbox className="h-12 w-12" /> : null);
  const retryAction =
    onRetry &&
    (action ?? (
      <Button
        variant="secondary"
        size="sm"
        onClick={onRetry}
        className="gap-2"
        aria-label="다시 시도"
      >
        <RefreshCw className="h-4 w-4" />
        다시 시도
      </Button>
    ));

  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50/50 py-12 px-4"
      role="status"
      aria-label="데이터 없음"
    >
      {displayIcon && (
        <div className="mb-4 text-gray-400 [&>svg]:h-12 [&>svg]:w-12">
          {displayIcon}
        </div>
      )}
      <h3 className="text-base font-medium text-gray-900">{displayTitle}</h3>
      {displayDescription && (
        <p className="mt-1 max-w-sm text-center text-sm text-gray-500">
          {displayDescription}
        </p>
      )}
      {(action ?? retryAction) && (
        <div className="mt-6">{action ?? retryAction}</div>
      )}
    </div>
  );
}
