'use client';

import { X, BarChart3, Calendar } from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import type { DashboardStatsResponse } from '@/types/database';
import type { FunnelDataItem, TimelineItem } from '@/lib/api/dashboard';

type InsightType = 'members' | 'requests' | 'completed' | 'settlement';

// ─── 공통 모달 래퍼 ─────────────────────────────────────────────
function ModalOverlay({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 animate-in fade-in duration-200 modal-bottom-sheet"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-white rounded-2xl max-w-lg w-full max-h-[85vh] overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 -m-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            aria-label="닫기"
          >
            <X className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
        <div className="overflow-y-auto max-h-[calc(85vh-60px)]">{children}</div>
      </div>
    </div>
  );
}

// ─── KPI Breakdown Modal (hover 시) ─────────────────────────────
export function KPIBreakdownModal({
  type,
  stats,
  onClose,
  onFunnelClick,
  onTimelineClick,
}: {
  type: InsightType;
  stats: DashboardStatsResponse;
  onClose: () => void;
  onFunnelClick?: () => void;
  onTimelineClick?: () => void;
}) {
  const formatMoney = (n: number) =>
    n >= 1_000_000 ? `₩${(n / 1_000_000).toFixed(1)}M` : `₩${n.toLocaleString()}`;

  if (type === 'members') {
    return (
      <ModalOverlay title="총 회원수 상세" onClose={onClose}>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BreakdownRow label="공인중개사" value={stats.realtorCount ?? 0} />
            <BreakdownRow label="제휴업체" value={stats.partnerCount ?? 0} />
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-3">
            <p className="text-sm font-medium text-blue-800">
              이번달 신규 가입 <span className="tabular-nums">+{stats.membersIncreaseThisMonth ?? 0}</span>명
            </p>
          </div>
        </div>
      </ModalOverlay>
    );
  }

  if (type === 'requests') {
    return (
      <ModalOverlay title="상담 요청 상세" onClose={onClose}>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BreakdownRow label="이번달" value={stats.thisMonthRequests ?? 0} />
            <BreakdownRow label="전월" value={stats.lastMonthRequests ?? 0} />
          </div>
          <div className="rounded-lg border border-gray-200 p-3">
            <p className="text-sm text-gray-700">
              전월 대비 <span className="font-medium tabular-nums">{(stats.requestDiff ?? 0) >= 0 ? '+' : ''}{stats.requestDiff ?? 0}</span>건
            </p>
          </div>
        </div>
      </ModalOverlay>
    );
  }

  if (type === 'completed') {
    return (
      <ModalOverlay title="완료 건수 상세" onClose={onClose}>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BreakdownRow label="당월 완료" value={stats.completedCount ?? 0} />
            <BreakdownRow label="전환율" value={`${stats.conversionRate ?? 0}%`} />
          </div>
          <div className="flex gap-2">
            {onFunnelClick && (
              <button
                onClick={() => { onClose(); onFunnelClick(); }}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 font-medium text-sm transition-colors"
              >
                <BarChart3 className="h-4 w-4" strokeWidth={2} />
                퍼널 보기
              </button>
            )}
            {onTimelineClick && (
              <button
                onClick={() => { onClose(); onTimelineClick(); }}
                className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-green-50 text-green-700 hover:bg-green-100 font-medium text-sm transition-colors"
              >
                <Calendar className="h-4 w-4" strokeWidth={2} />
                타임라인 보기
              </button>
            )}
          </div>
        </div>
      </ModalOverlay>
    );
  }

  if (type === 'settlement') {
    return (
      <ModalOverlay title="이번달 정산 상세" onClose={onClose}>
        <div className="p-6 space-y-4">
          <div className="rounded-xl bg-amber-50 border border-amber-100 p-4">
            <p className="text-sm text-amber-800 mb-1">이번달 정산 완료 금액</p>
            <p className="text-2xl font-bold text-amber-900 tabular-nums">
              {formatMoney(stats.thisMonthSettlementAmount ?? 0)}
            </p>
          </div>
        </div>
      </ModalOverlay>
    );
  }

  return null;
}

function BreakdownRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-2 px-3 rounded-lg bg-gray-50">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-semibold tabular-nums text-gray-900">{value}</span>
    </div>
  );
}

// ─── Funnel View Modal ──────────────────────────────────────────
const funnelStageColors: Record<string, string> = {
  unread: 'bg-red-500',
  read: 'bg-blue-400',
  assigned: 'bg-yellow-400',
  settlement_check: 'bg-purple-400',
  settlement_done: 'bg-green-500',
  cancelled: 'bg-gray-400',
  hq_review_needed: 'bg-orange-400',
};

export function FunnelViewModal({
  data,
  onClose,
}: {
  data: FunnelDataItem[];
  onClose: () => void;
}) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  return (
    <ModalOverlay title="전환율 퍼널" onClose={onClose}>
      <div className="p-6 space-y-3">
        <p className="text-sm text-gray-500 mb-4">이번달 상담 요청 단계별 현황</p>
        {data.map((item) => (
          <div key={item.stage} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="font-medium text-gray-700">{item.label}</span>
              <span className="tabular-nums text-gray-600">{item.count}건 ({item.rate ?? 0}%)</span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
              <div
                style={{ width: `${maxCount > 0 ? (item.count / maxCount) * 100 : 0}%` }}
                className={`h-full rounded-full transition-all duration-500 ${funnelStageColors[item.stage] ?? 'bg-gray-300'}`}
              />
            </div>
          </div>
        ))}
      </div>
    </ModalOverlay>
  );
}

// ─── Timeline View Modal ────────────────────────────────────────
export function TimelineViewModal({
  data,
  onClose,
}: {
  data: TimelineItem[];
  onClose: () => void;
}) {
  // 날짜별로 그룹화
  const byDate: Record<string, TimelineItem[]> = {};
  data.forEach((item) => {
    const d = new Date(item.completedAt).toLocaleDateString('ko-KR');
    if (!byDate[d]) byDate[d] = [];
    byDate[d].push(item);
  });
  const sortedDates = Object.keys(byDate).sort(
    (a, b) => (byDate[a][0]?.completedAt ?? '') < (byDate[b][0]?.completedAt ?? '') ? -1 : 1
  );

  return (
    <ModalOverlay title="당월 완료 타임라인" onClose={onClose}>
      <div className="p-6">
        {sortedDates.length === 0 ? (
          <p className="text-center text-gray-500 py-8">완료된 건이 없습니다</p>
        ) : (
          <div className="space-y-6">
            {sortedDates.map((dateStr) => (
              <div key={dateStr}>
                <h3 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary-500" strokeWidth={2} />
                  {dateStr}
                </h3>
                <ul className="space-y-2">
                  {byDate[dateStr].map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 py-2 px-3 rounded-lg bg-gray-50 border-l-4 border-green-400"
                    >
                      <span className="text-xs font-medium text-gray-500 shrink-0 w-16">
                        {item.categoryLabel}
                      </span>
                      <span className="text-sm text-gray-800 truncate flex-1">
                        {item.customerName || '고객'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </ModalOverlay>
  );
}
