'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Users,
  FileText,
  Wallet,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  AlertCircle,
  MessageSquare,
  CreditCard,
  UserPlus,
  Building2,
  AlertTriangle,
  ArrowRight,
  Minus,
  Clock,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ErrorMessage } from '@/components/ErrorBoundary';
import { useDashboardRealtime, useNewRequestsRealtime } from '@/lib/realtime';
import { useAuthHeaders } from '@/lib/auth-headers';
import { getErrorMessage, logger } from '@/lib/logger';
import { SERVICE_CATEGORY_LABELS, HQ_STATUS_LABELS, HqStatus } from '@/types/database';
import type {
  ServiceCategory,
  DashboardStatsResponse,
  RecentRequestItem,
  DashboardDateFilter,
  CategoryStatBreakdown,
  CancelledOrComplaintItem,
  PartnerRatingListItem,
  PartnerConversionListItem,
} from '@/types/database';

const DATE_FILTER_OPTIONS: { value: DashboardDateFilter; label: string }[] = [
  { value: 'this_month', label: '당월' },
  { value: 'last_month', label: '전월' },
  { value: 'last_7_days', label: '최근 7일' },
  { value: 'today', label: '오늘' },
  { value: 'yesterday', label: '어제' },
];

const statusVariants = {
  unread: 'red' as const,
  read: 'blue' as const,
  assigned: 'yellow' as const,
  settlement_check: 'purple' as const,
  settlement_done: 'green' as const,
  cancelled: 'gray' as const,
  hq_review_needed: 'orange' as const,
};

export default function DashboardPage() {
  const authHeaders = useAuthHeaders();
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>('this_month');
  const [stats, setStats] = useState<DashboardStatsResponse>({
    realtorCount: 0,
    partnerCount: 0,
    totalMembers: 0,
    membersIncreaseThisMonth: 0,
    thisMonthRequests: 0,
    lastMonthRequests: 0,
    requestDiff: 0,
    completedCount: 0,
    conversionRate: 0,
    thisMonthSettlementAmount: 0,
    unassignedCount: 0,
    pendingWithdrawals: 0,
    accountPendingCount: 0,
    newSignupsCount: 0,
    inquiryPendingCount: 0,
    categoryStats: {},
    topRealtors: [],
  });
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [cancelledOrComplaintList, setCancelledOrComplaintList] = useState<CancelledOrComplaintItem[]>([]);
  const [partnersByRating, setPartnersByRating] = useState<PartnerRatingListItem[]>([]);
  const [partnersByConversion, setPartnersByConversion] = useState<PartnerConversionListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [todayNewCount, setTodayNewCount] = useState(0);
  const [yesterdayNewCount, setYesterdayNewCount] = useState(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    const TIMEOUT_MS = 30_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    );

    try {
      const res = await Promise.race([
        fetch(`/api/admin/dashboard-stats?dateFilter=${dateFilter}`, {
          headers: authHeaders,
          credentials: 'include',
        }),
        timeoutPromise,
      ]) as Response;
      if (!res?.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${res.status}`);
      }
      const payload = await res.json();
      const statsData = payload.stats;
      setStats(statsData ?? {});
      setTodayNewCount(payload.todayNewCount ?? 0);
      setYesterdayNewCount(payload.yesterdayNewCount ?? 0);
      setRecentRequests(payload.recentRequests || []);
      setCancelledOrComplaintList(payload.cancelledOrComplaintList || []);
      setPartnersByRating(payload.partnersByRating || []);
      setPartnersByConversion(payload.partnersByConversion || []);
    } catch (err) {
      logger.error('대시보드 데이터 로드 오류', err);
      const msg = getErrorMessage(err);
      const friendly =
        msg === 'TIMEOUT'
          ? 'Supabase 연결이 지연되고 있습니다. 프로젝트가 일시정지 상태이거나 네트워크 문제일 수 있습니다. 무료 플랜은 미사용 시 자동 일시정지되므로 Supabase 대시보드(Project Settings → General)에서 "Restore project"로 재개한 뒤 아래 [재시도]를 눌러 주세요.'
          : msg.includes('Supabase가 설정되지 않았습니다') || msg.includes('설정되지 않았습니다')
            ? '서비스 설정이 완료되지 않았을 수 있습니다. Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)를 확인해 주세요.'
            : msg === '오류가 발생했습니다.'
              ? '대시보드 데이터를 불러오지 못했습니다. 네트워크와 로그인 상태를 확인한 뒤 재시도해 주세요.'
              : msg;
      setLoadError(friendly);
    } finally {
      setLoading(false);
    }
  }, [dateFilter, authHeaders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useNewRequestsRealtime();
  useDashboardRealtime(loadData);

  const formatMoney = (amount: number) => {
    if (amount >= 1000000) return `₩${(amount / 1000000).toFixed(1)}M`;
    return `₩${amount.toLocaleString()}`;
  };

  const formatMoneyFull = (amount: number) => `₩${amount.toLocaleString()}원`;

  /** 전월 대비 트렌드 렌더러 */
  const TrendBadge = ({ current, prev, invertGood = false }: { current: number; prev: number; invertGood?: boolean }) => {
    if (prev === 0) return null;
    const diff = current - prev;
    const pct = Math.abs(Math.round((diff / prev) * 100));
    const isUp = diff > 0;
    const isGood = invertGood ? !isUp : isUp;
    if (Math.abs(diff) < 1) return null;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isGood ? 'text-green-600' : 'text-red-500'}`}>
        {isUp
          ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} />
          : <TrendingDown className="h-3 w-3" strokeWidth={2.5} />}
        {pct}%
      </span>
    );
  };

  // 상태별 집계 합산 (카테고리별 categoryStats 합계, 날짜 필터 적용)
  const statusSummary = (() => {
    const cat = stats.categoryStats ?? {};
    const sum = { unassigned: 0, inProgress: 0, reserved: 0, delayed: 0, settlement_check: 0, settlement_done: 0, total: 0 };
    Object.values(cat).forEach((s) => {
      if (s && 'inProgress' in s) {
        const b = s as CategoryStatBreakdown;
        sum.unassigned += b.unassigned;
        sum.inProgress += b.inProgress;
        sum.reserved += b.reserved;
        sum.delayed += b.delayed;
        sum.settlement_check += b.settlement_check;
        sum.settlement_done += b.settlement_done;
        sum.total += b.total;
      }
    });
    return sum;
  })();

  const alertItems = [
    { label: '출금승인 대기', count: stats.pendingWithdrawals ?? 0, link: '/settlements', icon: Wallet },
    { label: '상담 미배정', count: stats.unassignedCount ?? 0, link: '/requests', icon: FileText },
    { label: '미수금 청구 (업체별)', count: null, link: '/payments/receivables', icon: CreditCard },
    { label: '공인중개사 신규가입', count: stats.realtorNewSignupsCount ?? 0, link: '/members/realtors', icon: Users },
    { label: '제휴업체 가입요청(승인대기)', count: stats.partnerApplicationPendingCount ?? 0, link: '/partner-applications', icon: UserPlus },
    { label: '계좌 인증 대기', count: stats.accountPendingCount ?? 0, link: '/members/realtors', icon: CreditCard },
    { label: '문의 답변 대기', count: stats.inquiryPendingCount ?? 0, link: '/admin/inquiries', icon: MessageSquare },
  ];

  const categories = ['moving', 'cleaning', 'internet_tv', 'interior', 'appliance_rental', 'kiosk'];

  const totalUnpaid = stats.financialSummary?.unpaidAmount ?? 0;
  const totalRevenue = stats.financialSummary?.settlementAmount ?? stats.thisMonthSettlementAmount ?? 0;
  const pendingPartners = stats.partnerApplicationPendingCount ?? 0;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {loadError && (
          <ErrorMessage message={loadError} onRetry={() => loadData()} />
        )}
        <div className="rounded-xl border border-slate-100 bg-white px-5 py-4 sm:px-6 sm:py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shadow-card mb-6">
          <div>
            <p className="inline-flex items-center gap-2 text-footnote font-semibold text-primary-600 uppercase tracking-widest">IEUM ADMIN</p>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight mt-2">대시보드</h1>
            <p className="mt-1 text-sm text-gray-500">전체 현황을 한눈에 확인하세요</p>
          </div>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 border-2 border-primary-600 text-primary-600 px-4 py-2.5 rounded-button font-semibold text-sm hover:bg-primary-50 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={2} />
            새로고침
          </button>
        </div>

        {/* 상단 KPI 카드 4개 — 클릭 시 해당 목록으로 이동 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <Link
            href="/requests?status=unread"
            className="bg-white rounded-xl border-0 p-4 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 active:scale-[0.99] block text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-50 text-primary-600">
                <MessageSquare className="h-4 w-4" strokeWidth={2} />
              </span>
              <p className="text-xs font-medium text-slate-500">오늘 신규 상담</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-slate-900">{todayNewCount}건</p>
            <div className="mt-1.5 flex items-center gap-1">
              <TrendBadge current={todayNewCount} prev={yesterdayNewCount} />
              {todayNewCount === yesterdayNewCount && yesterdayNewCount === 0 && (
                <span className="text-xs text-slate-500">전일 대비</span>
              )}
            </div>
          </Link>
          <Link
            href="/requests?status=assigned"
            className="bg-white rounded-xl border-0 p-4 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 active:scale-[0.99] block text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-600">
                <FileText className="h-4 w-4" strokeWidth={2} />
              </span>
              <p className="text-xs font-medium text-slate-500">진행 중 건수</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-slate-900">
              {statusSummary.inProgress + statusSummary.reserved + statusSummary.delayed + statusSummary.settlement_check}건
            </p>
            <p className="text-xs text-slate-500 mt-1">열람·배정·예약·정산확인</p>
          </Link>
          <Link
            href="/requests?status=settlement_done"
            className="bg-white rounded-xl border-0 p-4 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 active:scale-[0.99] block text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-green-50 text-green-600">
                <CreditCard className="h-4 w-4" strokeWidth={2} />
              </span>
              <p className="text-xs font-medium text-slate-500">이번 달 완료</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-green-600">{statusSummary.settlement_done}건</p>
            <p className="text-xs text-slate-500 mt-1">
              목표 대비 {statusSummary.total > 0 ? Math.round((statusSummary.settlement_done / statusSummary.total) * 100) : 0}%
            </p>
          </Link>
          <Link
            href="/settlements"
            className="bg-white rounded-xl border-0 p-4 shadow-card hover:shadow-card-hover transition-all hover:-translate-y-0.5 active:scale-[0.99] block text-left"
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-primary-50 text-primary-600">
                <Wallet className="h-4 w-4" strokeWidth={2} />
              </span>
              <p className="text-xs font-medium text-slate-500">이번 달 예상 매출</p>
            </div>
            <p className="text-2xl font-bold mt-1 text-primary-600">
              {formatMoney(stats.financialSummary?.settlementAmount ?? stats.thisMonthSettlementAmount ?? 0)}
            </p>
            <p className="text-xs text-slate-500 mt-1">정산 수납 기준</p>
          </Link>
        </div>

        {/* 재무·승인 요약 3종 */}
        <div data-testid="dashboard-finance-summary" className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Link href="/payments/receivables" className="rounded-xl border-0 bg-white px-6 py-5 shadow-card hover:shadow-card-hover hover:bg-slate-50/80 transition-all block">
            <p className="text-xs font-medium text-slate-500 mb-1">총 미수금</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary-600">{formatMoney(totalUnpaid)}</p>
            <p className="text-xs text-slate-500 mt-1">{stats.financialSummary?.unpaidCount ?? 0}건 미납</p>
          </Link>
          <div className="rounded-xl border-0 bg-white px-6 py-5 shadow-card">
            <p className="text-xs font-medium text-slate-500 mb-1">총 수익</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary-600">{formatMoney(totalRevenue)}</p>
            <p className="text-xs text-slate-500 mt-1">당월 정산 수납</p>
          </div>
          <Link href="/partner-applications" className="rounded-xl border-0 bg-white px-6 py-5 shadow-card hover:shadow-card-hover hover:bg-slate-50/80 transition-all block">
            <p className="text-xs font-medium text-slate-500 mb-1">승인 대기 업체</p>
            <p className="text-2xl sm:text-3xl font-bold text-primary-600">{pendingPartners}</p>
            <p className="text-xs text-slate-500 mt-1">제휴업체 가입요청</p>
          </Link>
        </div>

        {/* 정보요청(상담) 상태별 집계 */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-800">정보요청 상태별 집계</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                선택 기간: {DATE_FILTER_OPTIONS.find((o) => o.value === dateFilter)?.label ?? dateFilter}
                <span className="text-slate-500 ml-1">· 미배정 / 지연중 / 정산확인 / 전체완료 구분</span>
              </p>
            </div>
            <a href="/requests" className="text-sm text-primary-600 hover:text-primary-700 font-medium">요청 목록 →</a>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
              <div className="p-3 rounded-xl border border-red-200/80 bg-red-50/50">
                <div className="text-xs font-medium text-red-700">미배정</div>
                <div className="text-lg font-bold text-red-800 mt-0.5">{statusSummary.unassigned}</div>
              </div>
              <div className="p-3 rounded-xl border border-blue-200/80 bg-blue-50/50">
                <div className="text-xs font-medium text-blue-700">진행중(열람)</div>
                <div className="text-lg font-bold text-blue-800 mt-0.5">{statusSummary.inProgress}</div>
              </div>
              <div className="p-3 rounded-xl border border-sky-200/80 bg-sky-50/50">
                <div className="text-xs font-medium text-sky-700">예약완료</div>
                <div className="text-lg font-bold text-sky-800 mt-0.5">{statusSummary.reserved}</div>
              </div>
              <div className="bg-yellow-50 rounded-xl p-5 border border-yellow-200 flex flex-col justify-between transition-all duration-200 hover:border-yellow-300">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-bold text-yellow-700">지연중</span>
                  <Clock className="w-5 h-5 text-yellow-500" strokeWidth={2} />
                </div>
                <div>
                  <span className="text-2xl font-extrabold text-yellow-800">{statusSummary.delayed}</span>
                  <span className="text-yellow-600 text-sm font-medium ml-1">건</span>
                </div>
                <p className="text-xs text-yellow-600/80 mt-2">구매DB 24h 경과</p>
              </div>
              <div className="p-3 rounded-xl border border-purple-200 bg-purple-50/70">
                <div className="text-xs font-medium text-purple-700">정산확인</div>
                <div className="text-lg font-bold text-purple-800 mt-0.5">{statusSummary.settlement_check}</div>
              </div>
              <div className="p-3 rounded-xl border border-green-200 bg-green-50/70">
                <div className="text-xs font-medium text-green-700">전체완료</div>
                <div className="text-lg font-bold text-green-800 mt-0.5">{statusSummary.settlement_done}</div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-slate-500">합계 <strong className="text-slate-700">{statusSummary.total}건</strong></span>
              <span className="font-medium text-slate-700">
                전환률 <strong className="text-primary-600">{statusSummary.total > 0 ? Math.round((statusSummary.settlement_done / statusSummary.total) * 100) : 0}%</strong>
                <span className="text-slate-500 font-normal ml-1">(전체완료 {statusSummary.settlement_done}건 / 요청 {statusSummary.total}건)</span>
              </span>
            </div>
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 처리 필요 알림 */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <h2 className="text-base font-semibold text-slate-800 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-500" strokeWidth={2} />
                  처리 필요
                </h2>
              </CardHeader>
              <CardBody>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {alertItems.map((item, idx) => (
                    <a
                      key={item.label}
                      href={item.link}
                      className={`flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center">
                          <item.icon className="h-4 w-4 text-slate-500" strokeWidth={2} />
                        </div>
                        <span className="text-sm font-medium text-slate-700">{item.label}</span>
                      </div>
                      {item.count !== null ? (
                        <StatusBadge label={`${item.count}건`} variant="blue" />
                      ) : (
                        <span className="text-xs text-primary-600 font-medium">바로가기 →</span>
                      )}
                    </a>
                  ))}
                </div>
              </CardBody>
            </Card>
          </div>

          {/* 대기 현황 사이드 */}
          <Card>
            <CardHeader>
              <h2 className="text-lg font-medium text-slate-800">대기 현황</h2>
            </CardHeader>
            <CardBody className="p-0">
              <div className="divide-y divide-slate-200">
                {[
                  { label: '출금승인 대기', value: stats.pendingWithdrawals ?? 0 },
                  { label: '상담 미배정', value: stats.unassignedCount ?? 0 },
                  { label: '계좌 인증', value: stats.accountPendingCount ?? 0 },
                  { label: '문의 답변', value: stats.inquiryPendingCount ?? 0 },
                ].map((row, idx) => (
                  <div
                    key={row.label}
                    className={`flex justify-between text-sm px-6 py-3 ${idx % 2 === 1 ? 'bg-slate-50/60' : 'bg-white'}`}
                  >
                    <span className="text-slate-600">{row.label}</span>
                    <span className="font-medium text-slate-800">{row.value}</span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>

        {/* 재정 요약 (당월) */}
        <Card>
          <CardHeader className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-slate-800">재정 요약 (당월)</h2>
              <p className="text-xs text-slate-500 mt-0.5">제휴업체 정산 · 공인중개사 수수료 · 순수익 흐름</p>
            </div>
            <div className="flex items-center gap-3">
              <a href="/payments/receivables" className="text-xs text-amber-600 hover:text-amber-700 font-medium">미수금액 체크 및 결제 →</a>
              <a href="/settlements" className="text-sm text-primary-600 hover:text-primary-700">정산 관리 →</a>
            </div>
          </CardHeader>
          <CardBody className="space-y-5">
            {/* Row 1: 핵심 KPI 4개 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {/* 미수금 총액 */}
              <a
                href="/payments/receivables"
                className="group p-4 rounded-xl border border-amber-200 bg-amber-50/40 hover:bg-amber-100/60 transition-colors block"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">미수금 총액</span>
                  <TrendBadge
                    current={stats.financialSummary?.unpaidAmount ?? 0}
                    prev={stats.financialSummary?.prevMonthUnpaidAmount ?? 0}
                    invertGood
                  />
                </div>
                <div className="text-2xl font-bold text-amber-700">
                  {formatMoney(stats.financialSummary?.unpaidAmount ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  {stats.financialSummary?.unpaidCount ?? 0}건 미납 · 미수 청구 →
                </div>
              </a>

              {/* 당월 정산 수납 */}
              <div className="p-4 rounded-xl border border-green-200 bg-green-50/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">당월 정산 수납</span>
                  <TrendBadge
                    current={stats.financialSummary?.settlementAmount ?? 0}
                    prev={stats.financialSummary?.prevMonthSettlementAmount ?? 0}
                  />
                </div>
                <div className="text-2xl font-bold text-green-700">
                  {formatMoney(stats.financialSummary?.settlementAmount ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  전월: {formatMoney(stats.financialSummary?.prevMonthSettlementAmount ?? 0)}
                </div>
              </div>

              {/* 공인중개사 배정액(예상) */}
              <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">공인중개사 배정액(예상)</span>
                </div>
                <div className="text-2xl font-bold text-blue-700">
                  {formatMoney(stats.financialSummary?.realtorAssignmentAmount ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">
                  예약완료 {stats.financialSummary?.realtorAssignmentCount ?? 0}건 기준
                </div>
              </div>

              {/* 공제 후 순수익 예상 */}
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-slate-500">공제 후 순수익 예상</span>
                </div>
                <div className="text-2xl font-bold text-emerald-700">
                  {formatMoney(stats.financialSummary?.expectedProfitAfterDeduction ?? 0)}
                </div>
                <div className="text-xs text-slate-500 mt-1.5">수납 − 중개사 출금 기준</div>
              </div>
            </div>

            {/* Row 2: 재정 흐름 시각화 */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">당월 재정 흐름</p>
              <div className="flex flex-wrap items-center gap-2">
                {/* 제휴업체 수납 */}
                <div className="flex-1 min-w-[120px] text-center p-3 bg-white rounded-lg border border-slate-200">
                  <div className="text-xs text-slate-500 mb-1">제휴업체 수납완료</div>
                  <div className="text-base font-bold text-slate-800">
                    {formatMoney(stats.financialSummary?.settlementAmount ?? 0)}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-0.5 text-slate-300">
                  <Minus className="h-4 w-4" strokeWidth={2.5} />
                  <ArrowRight className="h-4 w-4" strokeWidth={2} />
                </div>

                {/* 공인중개사 수수료 */}
                <div className="flex-1 min-w-[140px] text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                  <div className="text-xs text-slate-500 mb-1">공인중개사 수수료</div>
                  <div className="text-base font-bold text-purple-700">
                    {formatMoney(
                      (stats.financialSummary?.realtorClaimCompletedAmount ?? 0) +
                      (stats.financialSummary?.realtorMonthlyClaimAmount ?? 0)
                    )}
                  </div>
                  <div className="flex justify-center gap-3 mt-1.5">
                    <span className="text-xs text-purple-500">
                      완료 {formatMoney(stats.financialSummary?.realtorClaimCompletedAmount ?? 0)}
                    </span>
                    {(stats.financialSummary?.realtorClaimPendingCount ?? 0) > 0 && (
                      <span className="text-xs text-amber-500">
                        대기 {stats.financialSummary?.realtorClaimPendingCount ?? 0}건
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col items-center gap-0.5 text-slate-300">
                  <span className="text-slate-300 font-light text-lg">=</span>
                </div>

                {/* 순수익 */}
                <div className="flex-1 min-w-[120px] text-center p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                  <div className="text-xs text-slate-500 mb-1">순수익 예상</div>
                  <div className="text-base font-bold text-emerald-700">
                    {formatMoney(stats.financialSummary?.expectedProfitAfterDeduction ?? 0)}
                  </div>
                </div>

                {/* 미수금 회수 예정 */}
                {(stats.financialSummary?.unpaidAmount ?? 0) > 0 && (
                  <>
                    <div className="text-slate-300 font-light text-sm">+</div>
                    <div className="flex-1 min-w-[120px] text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                      <div className="text-xs text-slate-500 mb-1">미수금 회수 예정</div>
                      <div className="text-base font-bold text-amber-600">
                        +{formatMoney(stats.financialSummary?.unpaidAmount ?? 0)}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {stats.financialSummary?.unpaidCount ?? 0}건 미납
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Row 3: 당월 미수 납부 현황 진행 바 */}
            {(stats.financialSummary?.totalReceivableThisMonth ?? 0) > 0 && (() => {
              const total = stats.financialSummary?.totalReceivableThisMonth ?? 0;
              const paid = stats.financialSummary?.paidReceivableThisMonth ?? 0;
              const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
              return (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-600">당월 미수 납부 현황</span>
                    <span className="text-slate-500">{paidPct}% 납부 완료</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div
                      className="bg-green-500 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-green-600">납부 완료 {formatMoneyFull(paid)}</span>
                    <span className="font-medium text-slate-500">
                      총 청구 {formatMoneyFull(total)}
                    </span>
                    <span className="text-amber-600">미납 {formatMoneyFull(total - paid)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Row 4: 공인중개사 배정액 vs 청구액 비교 */}
            {(stats.financialSummary?.realtorAssignmentAmount ?? 0) > 0 && (() => {
              const assigned = stats.financialSummary?.realtorAssignmentAmount ?? 0;
              const claimed = (stats.financialSummary?.realtorClaimCompletedAmount ?? 0) +
                (stats.financialSummary?.realtorMonthlyClaimAmount ?? 0);
              const claimedPct = assigned > 0 ? Math.min(100, Math.round((claimed / assigned) * 100)) : 0;
              return (
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-medium text-slate-600">공인중개사 수수료 집행률</span>
                    <span className="text-slate-500">배정액 대비 {claimedPct}% 집행</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5">
                    <div
                      className="bg-purple-400 h-2.5 rounded-full transition-all duration-500"
                      style={{ width: `${claimedPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-purple-600">청구액 {formatMoneyFull(claimed)}</span>
                    <span className="text-slate-500">배정(예상) {formatMoneyFull(assigned)}</span>
                  </div>
                </div>
              );
            })()}
          </CardBody>
        </Card>

        {/* 카테고리별 상담 현황 (날짜 필터 + 상태별) */}
        <Card>
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-medium text-slate-800">카테고리별 상담 현황</h2>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DashboardDateFilter)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {DATE_FILTER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-2 px-2 font-medium text-slate-600">카테고리</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">미배정</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">진행중(열람)</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">예약완료</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">지연중</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">정산확인</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">전체완료</th>
                    <th className="text-right py-2 px-2 font-medium text-slate-600">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.map((cat) => {
                    const s = stats.categoryStats?.[cat];
                    const breakdown = s && 'inProgress' in s ? (s as CategoryStatBreakdown) : null;
                    return (
                      <tr key={cat} className="border-b border-slate-100">
                        <td className="py-2 px-2 font-medium text-slate-700">{SERVICE_CATEGORY_LABELS[cat as keyof typeof SERVICE_CATEGORY_LABELS]}</td>
                        {breakdown ? (
                          <>
                            <td className="text-right py-2 px-2 text-slate-700">{breakdown.unassigned}</td>
                            <td className="text-right py-2 px-2 text-slate-700">{breakdown.inProgress}</td>
                            <td className="text-right py-2 px-2 text-slate-700">{breakdown.reserved}</td>
                            <td className="text-right py-2 px-2 text-amber-600">{breakdown.delayed}</td>
                            <td className="text-right py-2 px-2 text-slate-700">{breakdown.settlement_check}</td>
                            <td className="text-right py-2 px-2 text-slate-700">{breakdown.settlement_done}</td>
                            <td className="text-right py-2 px-2 font-medium text-slate-800">{breakdown.total}</td>
                          </>
                        ) : (
                          <>
                            <td className="text-right py-2 px-2 text-slate-700">{s?.unassigned ?? 0}</td>
                            <td className="text-right py-2 px-2 text-slate-400">-</td>
                            <td className="text-right py-2 px-2 text-slate-400">-</td>
                            <td className="text-right py-2 px-2 text-slate-400">-</td>
                            <td className="text-right py-2 px-2 text-slate-400">-</td>
                            <td className="text-right py-2 px-2 text-slate-400">-</td>
                            <td className="text-right py-2 px-2 font-medium text-slate-800">{(s as { total?: number })?.total ?? 0}</td>
                          </>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        {/* 저평점/불만 자동 리스트업 — 진행중 취소건·불만건 */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-slate-800 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={2} />
                저평점/불만 자동 리스트업
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">진행중 취소건 · 불만 접수 건 자동 집계</p>
            </div>
            <a href="/requests" className="text-sm text-primary-600 hover:text-primary-700">요청 목록 →</a>
          </CardHeader>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>고객명</th>
                  <th>연락처</th>
                  <th>카테고리</th>
                  <th>유형</th>
                  <th>제휴업체</th>
                  <th>신청일시</th>
                </tr>
              </thead>
              <tbody>
                {cancelledOrComplaintList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-slate-400 py-6">없음</td>
                  </tr>
                ) : (
                  cancelledOrComplaintList.map((item) => (
                    <tr key={item.id}>
                      <td className="font-medium">{item.customer?.name || '-'}</td>
                      <td>{item.customer?.phone || '-'}</td>
                      <td>{SERVICE_CATEGORY_LABELS[item.category as ServiceCategory]}</td>
                      <td>
                        <StatusBadge
                          label={item.reason === 'complaint' ? '불만' : '취소'}
                          variant={item.reason === 'complaint' ? 'red' : 'gray'}
                        />
                      </td>
                      <td>{item.partner_name || '-'}</td>
                      <td className="text-slate-400 text-sm">{new Date(item.created_at).toLocaleString('ko-KR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 제휴업체 저평점/불만 자동 리스트업 — 평점 낮은순·불만 많은순 */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-slate-800">제휴업체 저평점/불만 (자동 리스트업)</h2>
              <p className="text-xs text-slate-500 mt-0.5">평점 낮은순 · 불만 건수 많은순 자동 정렬</p>
            </div>
            <Link href="/members/partners" className="text-sm text-primary-600 hover:text-primary-700">제휴업체 목록 →</Link>
          </CardHeader>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>업체명</th>
                  <th>카테고리</th>
                  <th>평균평점</th>
                  <th>리뷰수</th>
                  <th>불만건수</th>
                </tr>
              </thead>
              <tbody>
                {partnersByRating.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400 py-6">데이터 없음</td>
                  </tr>
                ) : (
                  partnersByRating.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.business_name}</td>
                      <td>{(p.service_categories || []).map((c) => SERVICE_CATEGORY_LABELS[c] || c).join(', ') || '-'}</td>
                      <td>{p.avg_rating.toFixed(1)}</td>
                      <td>{p.total_reviews}</td>
                      <td className={p.unsatisfied_count > 0 ? 'text-amber-600 font-medium' : ''}>{p.unsatisfied_count}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 제휴업체 전환률 % — 낮은순 (전환=예약완료) */}
        <Card>
          <CardHeader className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-medium text-slate-800">제휴업체 DB 배정·전환률 % (낮은순)</h2>
              <p className="text-xs text-slate-500 mt-0.5">전환 기준: 예약완료 · 전환률 % 표시</p>
            </div>
            <Link href="/members/partners" className="text-sm text-primary-600 hover:text-primary-700">제휴업체 목록 →</Link>
          </CardHeader>
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>업체명</th>
                  <th>카테고리</th>
                  <th>배정건수</th>
                  <th>예약완료</th>
                  <th>전환률 %</th>
                </tr>
              </thead>
              <tbody>
                {partnersByConversion.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-slate-400 py-6">데이터 없음</td>
                  </tr>
                ) : (
                  partnersByConversion.map((p) => (
                    <tr key={p.id}>
                      <td className="font-medium">{p.business_name}</td>
                      <td>{(p.service_categories || []).map((c) => SERVICE_CATEGORY_LABELS[c] || c).join(', ') || '-'}</td>
                      <td>{p.assigned_count}</td>
                      <td>{p.reserved_count}</td>
                      <td className={p.conversion_rate < 50 ? 'text-amber-600 font-medium' : ''}>{p.conversion_rate}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* 상위 중개사 랭킹 */}
          <Card>
            <CardHeader className="flex justify-between items-center">
              <h2 className="text-lg font-medium text-slate-800">상위 중개사 랭킹 (이번달 리드 전환)</h2>
              <Link href="/members/realtors" className="text-sm text-primary-600 hover:text-primary-700">전체보기 →</Link>
            </CardHeader>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>업체명</th>
                    <th>전환건수</th>
                    <th>수익금</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.topRealtors ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-slate-400 py-6">데이터 없음</td>
                    </tr>
                  ) : (
                    stats.topRealtors.map((r, i) => (
                      <tr key={i}>
                        <td className="font-medium">{r.business_name}</td>
                        <td>{r.conversionCount}건</td>
                        <td>{r.amount != null ? formatMoney(r.amount) : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 서비스 요청 테이블 */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-lg font-semibold text-slate-800">최근 서비스 요청</h2>
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/requests"
                  className="inline-flex items-center px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-semibold hover:bg-primary-700 transition-colors shadow-button-sm"
                >
                  일괄 배정
                </Link>
                <Link
                  href="/requests"
                  className="inline-flex items-center px-3 py-1.5 rounded-lg border border-primary-600 text-primary-600 text-sm font-semibold hover:bg-primary-50 transition-colors"
                >
                  일괄 상태 변경
                </Link>
                <a href="/requests" className="text-sm text-slate-500 hover:text-slate-700 px-2 py-1.5">전체보기 →</a>
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">고객명</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">연락처</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">카테고리</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">상태</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider">신청일시</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-slate-400 py-8 text-sm">최근 요청이 없습니다</td>
                    </tr>
                  ) : (
                    recentRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-800">{request.customer?.name || '-'}</td>
                        <td className="py-3 px-4 text-slate-600">{request.customer?.phone || '-'}</td>
                        <td className="py-3 px-4 text-slate-600">{SERVICE_CATEGORY_LABELS[request.category as ServiceCategory]}</td>
                        <td className="py-3 px-4">
                          <StatusBadge
                            label={HQ_STATUS_LABELS[request.hq_status as HqStatus]}
                            variant={statusVariants[request.hq_status as keyof typeof statusVariants] ?? 'gray'}
                          />
                        </td>
                        <td className="py-3 px-4 text-slate-400">
                          {new Date(request.created_at).toLocaleString('ko-KR')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </AdminLayout>
  );
}
