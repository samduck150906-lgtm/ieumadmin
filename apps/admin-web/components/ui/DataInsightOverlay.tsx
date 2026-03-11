'use client';

import { TrendingUp, TrendingDown, AlertTriangle, Sparkles, Info } from 'lucide-react';
import { ReactNode } from 'react';

export type InsightType = 'trend_up' | 'trend_down' | 'alert' | 'insight' | 'info';

type DataInsightOverlayProps = {
  /** 인사이트 타입 */
  type: InsightType;
  /** 메인 텍스트 */
  label: string;
  /** 부가 설명 (선택) */
  sub?: string;
  /** 클릭 시 표시할 상세 내용 (토글) */
  detail?: ReactNode;
  /** 표시 여부 */
  visible?: boolean;
  /** 콤팩트 모드 */
  compact?: boolean;
};

const typeConfig: Record<InsightType, { icon: typeof TrendingUp; className: string }> = {
  trend_up: { icon: TrendingUp, className: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
  trend_down: { icon: TrendingDown, className: 'bg-rose-50 border-rose-200 text-rose-700' },
  alert: { icon: AlertTriangle, className: 'bg-amber-50 border-amber-200 text-amber-800' },
  insight: { icon: Sparkles, className: 'bg-primary-50 border-primary-200 text-primary-700' },
  info: { icon: Info, className: 'bg-slate-50 border-slate-200 text-slate-700' },
};

/**
 * Data Insight Overlay — KPI/카드에 인사이트를 오버레이로 표시
 * Toss/숨고/리멤버 스타일 데이터 인사이트 배지
 */
export function DataInsightOverlay({
  type,
  label,
  sub,
  detail,
  visible = true,
  compact = false,
}: DataInsightOverlayProps) {
  const config = typeConfig[type];
  const Icon = config.icon;

  if (!visible) return null;

  return (
    <div
      className={`
        inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium
        transition-opacity duration-200
        ${config.className}
        ${compact ? 'py-0.5 px-2' : ''}
      `}
    >
      <Icon className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} strokeWidth={2} />
      <span>{label}</span>
      {sub && !compact && <span className="opacity-85">· {sub}</span>}
      {detail && <span className="ml-0.5 opacity-70">▼</span>}
    </div>
  );
}

/**
 * 인사이트 스택 — 여러 인사이트를 수평으로 나열
 */
export function InsightStack({
  items,
  className = '',
}: {
  items: { type: InsightType; label: string; sub?: string }[];
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((item, i) => (
        <DataInsightOverlay
          key={`${item.type}-${item.label}-${i}`}
          type={item.type}
          label={item.label}
          sub={item.sub}
          compact
        />
      ))}
    </div>
  );
}
