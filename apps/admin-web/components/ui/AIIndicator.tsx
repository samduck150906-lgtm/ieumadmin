'use client';

import { Sparkles } from 'lucide-react';

/** Premium Korean SaaS: AI/Smart Assist 인디케이터 */
export type AIVariant = 'priority' | 'alert' | 'trending' | 'new' | 'insight' | 'enterprise';

const variantClasses: Record<AIVariant, string> = {
  priority: 'bg-primary-100 text-primary-700 border-primary-200/60',
  alert: 'bg-amber-100 text-amber-700 border-amber-200/60',
  trending: 'bg-emerald-100 text-emerald-700 border-emerald-200/60',
  new: 'bg-purple-100 text-purple-700 border-purple-200/60',
  insight: 'bg-slate-100 text-slate-700 border-slate-200/60',
  enterprise: 'bg-indigo-100 text-indigo-700 border-indigo-200/60',
};

type AIIndicatorProps = {
  label: string;
  variant?: AIVariant;
  /** AI 아이콘 표시 (Smart Assist 강조) */
  showIcon?: boolean;
  /** 콤팩트 모드 */
  compact?: boolean;
};

export function AIIndicator({
  label,
  variant = 'priority',
  showIcon = false,
  compact = false,
}: AIIndicatorProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium
        transition-transform duration-150 hover:scale-105
        ${variantClasses[variant]}
        ${compact ? 'py-0.5' : 'py-1'}
      `}
    >
      {showIcon ? (
        <Sparkles className="h-3 w-3" strokeWidth={2} aria-hidden />
      ) : (
        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70 shrink-0" aria-hidden />
      )}
      <span>{label}</span>
    </span>
  );
}
