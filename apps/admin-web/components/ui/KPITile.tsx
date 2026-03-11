'use client';

import type { LucideIcon } from 'lucide-react';

type KPITileProps = {
  name: string;
  value: string | number;
  sub?: string | null;
  icon: LucideIcon;
  color: string;
  /** 트렌드: 상승/하락/중립 (Smart KPI) */
  trend?: 'up' | 'down' | 'neutral';
  /** 강조 (알림 등) */
  highlighted?: boolean;
  index?: number;
  /** Insight Layer: hover 시 상세 breakdown 모달 열기 */
  onInsightHover?: () => void;
  /** Insight Layer: 클릭 시 breakdown 모달 (일반 KPI) */
  onInsightClick?: () => void;
  /** 완료 건수 전용: 전환율 클릭 → funnel, 당월완료 클릭 → timeline */
  completedCount?: number;
  conversionRate?: number;
  onFunnelClick?: () => void;
  onTimelineClick?: () => void;
};

export function KPITile({
  name,
  value,
  sub,
  icon: Icon,
  color,
  trend,
  highlighted = false,
  index = 0,
  onInsightHover,
  onInsightClick,
  completedCount,
  conversionRate,
  onFunnelClick,
  onTimelineClick,
}: KPITileProps) {
  const hasCompletedInsight = completedCount != null && (onFunnelClick || onTimelineClick);
  const hasInsight = Boolean(onInsightHover || onInsightClick || hasCompletedInsight);
  const handleClick = !hasCompletedInsight ? onInsightClick : undefined;
  const handleMouseEnter = onInsightHover;

  const renderValue = () => {
    if (hasCompletedInsight) {
      return (
        <dd className="flex items-center gap-2 mt-0.5 flex-wrap">
          {onTimelineClick ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onTimelineClick();
              }}
              className="text-lg sm:text-xl font-bold text-text tabular-nums cursor-pointer hover:text-primary-700 hover:underline"
              title="타임라인 보기"
            >
              {completedCount}
            </span>
          ) : (
            <span className="text-lg sm:text-xl font-bold text-text tabular-nums">{completedCount}</span>
          )}
          <span className="text-text-secondary">(</span>
          {onFunnelClick ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                onFunnelClick();
              }}
              className="text-lg sm:text-xl font-bold text-text tabular-nums cursor-pointer hover:text-primary-700 hover:underline"
              title="퍼널 보기"
            >
              전환율 {conversionRate ?? 0}%
            </span>
          ) : (
            <span className="text-lg sm:text-xl font-bold text-text tabular-nums">전환율 {conversionRate ?? 0}%</span>
          )}
          <span className="text-text-secondary">)</span>
        </dd>
      );
    }
    return (
      <>
        <dd className="flex items-center gap-2 mt-0.5">
          <span className="text-lg sm:text-xl font-bold text-text tabular-nums">{value}</span>
          {trend === 'up' && (
            <span className="text-xs font-medium text-secondary-600">▲</span>
          )}
          {trend === 'down' && (
            <span className="text-xs font-medium text-brand-error">▼</span>
          )}
        </dd>
        {sub && (
          <dd className="text-xs text-text-secondary mt-0.5">
            {trend === 'up' && sub.startsWith('+') && (
              <span className="text-secondary-600">{sub}</span>
            )}
            {trend === 'down' && !sub.startsWith('+') && sub.includes('-') && (
              <span className="text-brand-error">{sub}</span>
            )}
            {(!trend || trend === 'neutral') && sub}
          </dd>
        )}
      </>
    );
  };

  return (
    <div
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      role={hasInsight ? 'button' : undefined}
      tabIndex={hasInsight ? 0 : undefined}
      onKeyDown={hasInsight ? (e) => e.key === 'Enter' && handleClick?.() : undefined}
      className={`
        relative overflow-hidden rounded-xl border border-primary/20 transition-all duration-250 ease-in-out
        ${highlighted ? 'border-secondary-200 bg-secondary/20' : 'bg-surface'}
        ${hasInsight ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-card-hover active:scale-[0.98]' : ''}
      `}
      title={hasInsight ? '클릭·호버하여 상세 보기' : undefined}
    >
      <div className="p-4 sm:p-5">
        <div className="flex items-center gap-3 sm:gap-4">
          <div
            className={`flex-shrink-0 w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center ${color}`}
          >
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <dt className="text-xs font-medium text-text-secondary truncate">{name}</dt>
            {renderValue()}
          </div>
        </div>
      </div>
    </div>
  );
}
