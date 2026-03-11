'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { showError } from '@/lib/toast';
import Link from 'next/link';
import {
  ClipboardList,
  CheckCircle,
  Wallet,
  Eye,
  Star,
  ShoppingCart,
  ArrowRight,
  AlertCircle,
  Phone,
  XCircle,
  RefreshCw,
  BarChart3,
} from 'lucide-react';

interface DashboardStats {
  receivableTotal: number;
  receivableList: { id: string; amount: number; service_request_id: string }[];
  interestMatchCount: number;
  monthlyCompletedCount: number;
  monthlyCompletedAmount: number;
  lastMonthCompletedAmount: number;
  assignedConversionRate: number;
  purchasedConversionRate: number;
  lastMonthAssignedConversionRate: number;
  pipelineCounts: Record<string, number>;
  totalPipeline: number;
  mileageBalance: number;
  mileageTotalEarned: number;
}

interface MileageHistoryItem {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  balance_after: number;
  created_at: string;
}

const MILEAGE_TYPE_LABELS: Record<string, string> = {
  earned_3pct: '3% 적립',
  earned_5pct: '5% 적립',
  used_db_purchase: 'DB 구매 사용',
  used_payment: '결제 사용',
  manual_add: '수동 적립',
  manual_deduct: '수동 차감',
};

const STATUS_LABELS: Record<string, string> = {
  unread: '상담전',
  read: '진행중',
  consulting: '상담중',
  visiting: '방문상담',
  reserved: '예약완료',
  absent: '부재중',
  cancelled: '취소',
  completed: '완료',
  pending: '보류',
};

const STATUS_COLORS: Record<string, string> = {
  unread: 'bg-red-50 text-red-700 border-red-200',
  read: 'bg-blue-50 text-blue-700 border-blue-200',
  consulting: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  visiting: 'bg-purple-50 text-purple-700 border-purple-200',
  reserved: 'bg-green-50 text-green-700 border-green-200',
  absent: 'bg-orange-50 text-orange-700 border-orange-200',
  cancelled: 'bg-gray-100 text-gray-500 border-gray-200',
  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-yellow-50 text-yellow-700 border-yellow-200',
};

const ACTIVE_STATUSES = ['unread', 'read', 'consulting', 'visiting', 'reserved', 'absent'];
const CLOSED_STATUSES = ['completed', 'cancelled', 'pending'];

export default function PartnerDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mileageHistory, setMileageHistory] = useState<MileageHistoryItem[]>([]);

  const loadData = useCallback(async (retryOn401 = false) => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    const TIMEOUT_MS = 15_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    );
    try {
      // 세션 초기화 대기: Supabase 클라이언트가 스토리지에서 세션을 불러오는 동안 잠시 대기
      let token: string | undefined;
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data: sessionData } = await supabase.auth.getSession();
        token = sessionData.session?.access_token;
        if (token) break;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 350));
      }
      const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
      const fetchOpts: RequestInit = { headers, credentials: 'include' };

      const statsRes = await Promise.race([
        fetch('/api/partner/dashboard-stats', fetchOpts),
        timeoutPromise,
      ]);

      // 401 시 세션 갱신 후 1회 재시도 (토큰 만료 대응)
      if (statsRes.status === 401 && !retryOn401) {
        const { data } = await supabase.auth.refreshSession();
        const newToken = data.session?.access_token;
        if (newToken) {
          const retryHeaders = { Authorization: `Bearer ${newToken}` };
          const retryRes = await fetch('/api/partner/dashboard-stats', {
            headers: retryHeaders,
            credentials: 'include',
          });
          if (retryRes.ok) {
            const json = await retryRes.json();
            setStats(json);
            const mileageRes = await fetch('/api/partner/mileage?limit=5', {
              headers: retryHeaders,
              credentials: 'include',
            }).catch(() => {
              showError('마일리지 내역을 불러오지 못했습니다.');
              return null;
            });
            if (mileageRes?.ok) {
              const mileageJson = await mileageRes.json();
              setMileageHistory(mileageJson.history || []);
            }
            setLoading(false);
            return;
          }
        }
      }

      if (!statsRes.ok) {
        const err = await statsRes.json().catch(() => ({}));
        throw new Error(err.error || `통계 조회 실패 (${statsRes.status})`);
      }
      const json = await statsRes.json();
      setStats(json);

      const mileageRes = await fetch('/api/partner/mileage?limit=5', fetchOpts).catch(() => {
        showError('마일리지 내역을 불러오지 못했습니다.');
        return null;
      });
      if (mileageRes?.ok) {
        const mileageJson = await mileageRes.json();
        setMileageHistory(mileageJson.history || []);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '로드 실패';
      setError(msg === 'TIMEOUT' ? '데이터 로드가 지연되고 있습니다. 새로고침해 주세요.' : msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fmt = (n: number) => `₩${n.toLocaleString()}`;

  if (loading && !stats) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="h-8 w-48 rounded-lg bg-gray-200 animate-pulse" />
            <div className="h-4 w-64 mt-2 rounded bg-gray-100 animate-pulse" />
          </div>
          <div className="h-10 w-10 rounded-xl bg-gray-100 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="bg-white rounded-2xl shadow-card p-4">
              <div className="h-4 w-16 rounded bg-gray-100 animate-pulse mb-2" />
              <div className="h-7 w-24 rounded bg-gray-200 animate-pulse" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl shadow-card p-5">
          <div className="h-5 w-32 rounded bg-gray-100 animate-pulse mb-4" />
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-50 animate-pulse" />
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
          <span className="ml-2 text-sm text-gray-500">데이터 불러오는 중...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 rounded-2xl text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 font-medium mb-3">{error}</p>
        <button
          type="button"
          onClick={() => void loadData()}
          className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-medium"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const s = stats!;
  const activeTotal = ACTIVE_STATUSES.reduce((sum, st) => sum + (s.pipelineCounts?.[st] ?? 0), 0);

  const unreadCount = s.pipelineCounts?.unread ?? 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">대시보드</h1>
          <p className="text-sm text-gray-500 mt-0.5">미수금·파이프라인·실적을 한눈에</p>
        </div>
        <button
          type="button"
          onClick={() => void loadData()}
          className="p-2 rounded-xl bg-white border hover:bg-gray-50 transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* 미열람(새 배정) CTA — DB 유통 루프: 본사 배정 → 제휴사 열람 */}
      {unreadCount > 0 ? (
        <Link
          href="/partner/assignments?status=unread"
          className="flex items-center gap-4 p-4 rounded-2xl border-2 border-red-200 bg-red-50 hover:bg-red-100/80 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <Eye className="w-6 h-6 text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-red-800">새로 배정된 DB {unreadCount}건 — 열람 대기</p>
            <p className="text-sm text-red-600 mt-0.5">본사에서 배정한 건입니다. DB 관리에서 확인 후 상태를 진행해 주세요.</p>
          </div>
          <ArrowRight className="w-5 h-5 text-red-600 shrink-0" />
        </Link>
      ) : (
        <Link
          href="/partner/assignments"
          className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100/80 transition-colors"
        >
          <ClipboardList className="w-8 h-8 text-gray-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-700">배정된 DB는 내 DB 관리에서 확인·열람할 수 있습니다</p>
            <p className="text-xs text-gray-500 mt-0.5">고객 신청 → 어드민 확인 → 제휴사 배정 → 제휴사 열람 순으로 이어집니다.</p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-400 shrink-0" />
        </Link>
      )}

      {/* 제휴업체 DB 조절 인터페이스 — DB 구매 + 업무 상태 조절(상담전~전체완료) */}
      <div className="bg-gradient-to-r from-brand-primary/5 to-purple-50 rounded-2xl border-2 border-brand-primary/20 p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">제휴업체 DB 조절</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/partner/db-list"
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-brand-primary/30 hover:border-brand-primary hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-brand-primary/10 flex items-center justify-center group-hover:bg-brand-primary/20 transition-colors">
              <ShoppingCart className="w-6 h-6 text-brand-primary" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">DB 구매</p>
              <p className="text-xs text-gray-500 mt-0.5">직접 DB를 구매하고 마일리지로 결제할 수 있습니다.</p>
            </div>
            <ArrowRight className="w-5 h-5 text-brand-primary shrink-0 ml-auto" />
          </Link>
          <Link
            href="/partner/assignments"
            className="flex items-center gap-4 p-4 bg-white rounded-xl border border-purple-200 hover:border-purple-400 hover:shadow-md transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center group-hover:bg-purple-200 transition-colors">
              <ClipboardList className="w-6 h-6 text-purple-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">DB 관리(업무상태)</p>
              <p className="text-xs text-gray-500 mt-0.5">상태값 변경: 상담전 → 진행중 → … → 전체완료</p>
            </div>
            <ArrowRight className="w-5 h-5 text-purple-600 shrink-0 ml-auto" />
          </Link>
        </div>
      </div>

      {/* 상단 요약 카드 4개 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Wallet className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-gray-500">미수금</span>
          </div>
          <p className="text-xl font-bold text-amber-700">{fmt(s.receivableTotal)}</p>
          <div className="flex items-center gap-2 mt-1 text-xs">
            <Link href="/partner/unpaid-pay" className="text-brand-primary hover:underline">
              바로 결제 →
            </Link>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
            <span className="text-xs text-gray-500">마일리지</span>
          </div>
          <p className="text-xl font-bold text-amber-600">{fmt(s.mileageBalance ?? 0)}</p>
          <p className="text-xs text-gray-400 mt-0.5">누적 {fmt(s.mileageTotalEarned ?? 0)}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Eye className="w-4 h-4 text-purple-500" />
            <span className="text-xs text-gray-500">관심DB 추천</span>
          </div>
          <p className="text-xl font-bold text-purple-700">{s.interestMatchCount}건</p>
          <Link href="/partner/db-list" className="text-xs text-brand-primary mt-1 block hover:underline">
            DB 마켓에서 확인 →
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-500">당월 완료</span>
          </div>
          <p className="text-xl font-bold text-green-700">{s.monthlyCompletedCount}건</p>
          <p className="text-xs text-gray-400 mt-0.5">{fmt(s.monthlyCompletedAmount)}</p>
        </div>
      </div>

      {/* 미수금 리스트 */}
      {s.receivableList.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-500" />
              <h2 className="font-semibold">미수금 리스트</h2>
              <span className="bg-amber-100 text-amber-700 text-xs px-2 py-0.5 rounded-full font-medium">
                {s.receivableList.length}건
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/partner/unpaid-pay"
                className="flex items-center gap-1 text-sm text-brand-primary font-medium hover:underline"
              >
                전체 결제
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
          <ul className="space-y-2">
            {s.receivableList.slice(0, 5).map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-600">미수금</span>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-amber-700">{fmt(r.amount)}</span>
                  <Link
                    href={`/partner/assignments?sr=${r.service_request_id}`}
                    className="text-xs text-brand-primary hover:underline"
                  >
                    상세
                  </Link>
                </div>
              </li>
            ))}
            {s.receivableList.length > 5 && (
              <li className="text-center text-xs text-gray-400 pt-1">
                외 {s.receivableList.length - 5}건 더 있음
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 진행 상태별 현황 */}
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-500" />
            <h2 className="font-semibold">파이프라인 현황</h2>
          </div>
          <Link href="/partner/assignments" className="text-sm text-brand-primary hover:underline flex items-center gap-1">
            전체 보기 <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="mb-3">
          <p className="text-xs text-gray-500 mb-2 font-medium">진행중 ({activeTotal}건)</p>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {ACTIVE_STATUSES.map((st) => (
              <Link
                key={st}
                href={`/partner/assignments?status=${st}`}
                className={`border rounded-xl p-2.5 text-center transition-colors hover:opacity-80 ${STATUS_COLORS[st]}`}
              >
                <p className="text-lg font-bold">{s.pipelineCounts?.[st] ?? 0}</p>
                <p className="text-xs mt-0.5">{STATUS_LABELS[st]}</p>
              </Link>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-2 font-medium">완료/종결</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {CLOSED_STATUSES.map((st) => (
              <Link
                key={st}
                href={`/partner/assignments?status=${st}`}
                className={`border rounded-xl p-2.5 text-center transition-colors hover:opacity-80 ${STATUS_COLORS[st]}`}
              >
                <p className="text-lg font-bold">{s.pipelineCounts?.[st] ?? 0}</p>
                <p className="text-xs mt-0.5">{STATUS_LABELS[st]}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* 배정·구매 DB 전환률 — 전환값이 잘 보이도록 강조 */}
      <div className="bg-white rounded-2xl shadow-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-brand-primary" />
            <h2 className="font-semibold">전환률 현황</h2>
          </div>
          <span className="text-xs text-gray-500">예약완료·전체완료 합산</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gradient-to-br from-brand-primary/10 to-purple-50 rounded-2xl border-2 border-brand-primary/30 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">배정 DB 전환률</p>
            <p className="text-4xl font-bold text-brand-primary">
              {s.assignedConversionRate ?? 0}<span className="text-xl font-semibold text-gray-500">%</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">배정받은 DB 중 예약·완료 비율</p>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-brand-primary/10 rounded-2xl border-2 border-purple-200 p-5">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">구매 DB 전환률</p>
            <p className="text-4xl font-bold text-purple-600">
              {s.purchasedConversionRate ?? 0}<span className="text-xl font-semibold text-gray-500">%</span>
            </p>
            <p className="text-xs text-gray-500 mt-1">직접 구매한 DB 중 예약·완료 비율</p>
          </div>
        </div>
        {(s.lastMonthAssignedConversionRate ?? 0) > 0 && (
          <p className="text-xs text-gray-400 mt-3">
            전월 배정 전환률: {s.lastMonthAssignedConversionRate}%
          </p>
        )}
      </div>

      {/* 마일리지 안내 */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
        <div className="flex items-start gap-3">
          <Star className="w-5 h-5 text-amber-500 fill-amber-400 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-amber-800">마일리지 적립 혜택</h3>
            <ul className="text-sm text-amber-700 mt-1.5 space-y-0.5">
              <li>• 결제금액 200만원 이상 → <strong>3% 마일리지</strong> 적립</li>
              <li>• 결제금액 500만원 이상 → <strong>5% 마일리지</strong> 적립</li>
              <li>• 적립된 마일리지는 DB 구매 및 미수금 결제 시 우선 차감</li>
            </ul>
            {(s.mileageBalance ?? 0) > 0 && (
              <p className="mt-2 text-sm font-semibold text-amber-800">
                현재 잔액: {fmt(s.mileageBalance)} 사용 가능
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 마일리지 최근 거래 내역 */}
      {mileageHistory.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
              <h2 className="font-semibold">마일리지 최근 내역</h2>
            </div>
          </div>
          <ul className="space-y-2">
            {mileageHistory.map((log) => {
              const isEarn = log.amount > 0;
              const dateStr = new Date(log.created_at).toLocaleDateString('ko-KR', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              return (
                <li key={log.id} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-700 truncate">
                      {MILEAGE_TYPE_LABELS[log.type] ?? log.type}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
                  </div>
                  <div className="text-right shrink-0 ml-3">
                    <p className={`font-semibold text-sm ${isEarn ? 'text-green-600' : 'text-red-500'}`}>
                      {isEarn ? '+' : ''}{fmt(log.amount)}
                    </p>
                    <p className="text-xs text-gray-400">잔액 {fmt(log.balance_after)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* 빠른 이동 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <Link
          href="/partner/db-list"
          className="flex items-center justify-center gap-2 py-3 bg-brand-primary text-white rounded-xl text-sm font-medium hover:opacity-90"
        >
          <ShoppingCart className="w-4 h-4" />
          DB 구매
        </Link>
        <Link
          href="/partner/assignments"
          className="flex items-center justify-center gap-2 py-3 bg-white border text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
        >
          <Phone className="w-4 h-4" />
          DB 관리
        </Link>
        <Link
          href="/partner/unpaid-pay"
          className="flex items-center justify-center gap-2 py-3 bg-white border text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-50"
        >
          <XCircle className="w-4 h-4" />
          결제(미수)
        </Link>
      </div>
    </div>
  );
}
