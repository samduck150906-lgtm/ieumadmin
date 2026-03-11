'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { Card as UiCard, CardHeader, CardBody } from '@/components/ui/Card';
import { formatCurrency, formatDate, formatPercentChange } from '@/utils/format';
import { Skeleton } from '@/components/ui/Skeleton';
import Chart from '@/components/ui/Chart';
import {
  Users,
  UserCheck,
  FileText,
  MessageSquare,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  AlertTriangle,
  Minus,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Building2,
  Wallet,
  Clock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  getDashboardStats,
  getRecentRequests,
  getCancelledAndComplaintRequests,
  getPartnersByRatingOrComplaints,
  getPartnersByConversionRate,
} from '@/lib/api/dashboard';
import { getErrorMessage, logger } from '@/lib/logger';
import { useDashboardRealtime, useNewRequestsRealtime } from '@/lib/realtime';
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

type PeriodFilter = 'monthly' | 'weekly' | 'daily';

const PERIOD_LABELS: Record<PeriodFilter, string> = {
  monthly: '월별',
  weekly: '주별',
  daily: '일별',
};

type RevenueChartItem = { period: string; revenue: number; settlement: number; commission: number };
type SettlementDonutItem = { name: string; value: number };

const DATE_FILTER_OPTIONS: { value: DashboardDateFilter; label: string }[] = [
  { value: 'this_month', label: '당월' },
  { value: 'last_month', label: '전월' },
  { value: 'last_7_days', label: '최근 7일' },
  { value: 'today', label: '오늘' },
  { value: 'yesterday', label: '어제' },
];

/** 대시보드 KPI 카드 */
function StatsCard({
  title,
  value,
  change,
  icon: Icon,
  loading,
  color = 'brand',
}: {
  title: string;
  value: string | number;
  change?: number;
  icon: React.ComponentType<{ className?: string }>;
  loading?: boolean;
  color?: 'brand' | 'green' | 'amber' | 'indigo';
}) {
  const colorMap = {
    brand: 'bg-brand-50 text-brand-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600',
    indigo: 'bg-indigo-50 text-indigo-600',
  };

  if (loading) {
    return (
      <UiCard>
        <CardBody className="flex flex-row items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-28" />
          </div>
        </CardBody>
      </UiCard>
    );
  }

  return (
    <UiCard>
      <CardBody className="flex flex-row items-center gap-4">
        <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${colorMap[color]}`}>
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-xl font-bold text-gray-900 tabular-nums">{value}</p>
          {change != null && (
            <p
              className={`flex items-center gap-0.5 text-sm font-medium ${change >= 0 ? 'text-green-600' : 'text-red-500'}`}
            >
              {change >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5" />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5" />
              )}
              {formatPercentChange(change)} vs 지난달
            </p>
          )}
        </div>
      </CardBody>
    </UiCard>
  );
}

/** 빠른 작업 버튼 */
function QuickAction({
  label,
  count,
  href,
  icon: Icon,
}: {
  label: string;
  count?: number;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <a
      href={href}
      className="flex w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm"
    >
      <Icon className="h-4 w-4 shrink-0 text-gray-400" />
      <span className="truncate">{label}</span>
      {count != null && count > 0 && (
        <span className="ml-auto rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700 tabular-nums">
          {count}건
        </span>
      )}
    </a>
  );
}

/** 기간 토글 버튼 */
function PeriodToggle({
  value,
  onChange,
}: {
  value: PeriodFilter;
  onChange: (v: PeriodFilter) => void;
}) {
  return (
    <div className="flex rounded-lg bg-gray-100 p-0.5">
      {(['monthly', 'weekly', 'daily'] as PeriodFilter[]).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={`rounded-md px-3 py-1 text-xs font-medium transition-all ${
            value === p
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

export default function AdminDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chartPeriod, setChartPeriod] = useState<PeriodFilter>('monthly');
  const [dateFilter, setDateFilter] = useState<DashboardDateFilter>('this_month');
  const dateFilterLabel = DATE_FILTER_OPTIONS.find((o) => o.value === dateFilter)?.label ?? '당월';
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const today = formatDate(new Date(), 'korean');
  const dayName = ['일', '월', '화', '수', '목', '금', '토'][new Date().getDay()];

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
    inactiveRealtorCount: 0,
    categoryStats: {},
    topRealtors: [],
  });
  const [cancelledOrComplaintList, setCancelledOrComplaintList] = useState<CancelledOrComplaintItem[]>([]);
  const [partnersByRating, setPartnersByRating] = useState<PartnerRatingListItem[]>([]);
  const [partnersByConversion, setPartnersByConversion] = useState<PartnerConversionListItem[]>([]);
  const [recentRequests, setRecentRequests] = useState<RecentRequestItem[]>([]);
  const [revenueChartData, setRevenueChartData] = useState<RevenueChartItem[]>([]);
  const [settlementDonutData, setSettlementDonutData] = useState<SettlementDonutItem[]>([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const TIMEOUT_MS = 18_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('TIMEOUT')), TIMEOUT_MS)
    );
    try {
      const [statsData, requestsData, cancelledData, ratingData, conversionData, chartsRes] = await Promise.race([
        Promise.all([
          getDashboardStats({ dateFilter }),
          getRecentRequests(5),
          getCancelledAndComplaintRequests(15),
          getPartnersByRatingOrComplaints(10),
          getPartnersByConversionRate(10),
          fetch('/api/admin/dashboard-charts').then((r) => (r.ok ? r.json() : { revenueChart: [], settlementDonut: [] })),
        ]),
        timeoutPromise,
      ]);
      setStats(statsData);
      setRecentRequests(requestsData || []);
      setCancelledOrComplaintList(cancelledData || []);
      setPartnersByRating(ratingData || []);
      setPartnersByConversion(conversionData || []);
      setRevenueChartData(chartsRes?.revenueChart ?? []);
      setSettlementDonutData(chartsRes?.settlementDonut ?? []);
      setLastRefresh(new Date());
    } catch (err) {
      logger.error('어드민 대시보드 데이터 로드 오류', err);
      const msg = getErrorMessage(err);
      const friendly =
        msg === 'TIMEOUT'
          ? '데이터 로드가 지연되고 있습니다. 네트워크 또는 서버 상태를 확인한 뒤 [재시도]를 눌러 주세요.'
          : msg.includes('Supabase가 설정되지 않았습니다') || msg.includes('설정되지 않았습니다')
            ? '서비스 설정을 확인해 주세요. (Supabase 환경변수)'
            : msg === '오류가 발생했습니다.'
              ? '대시보드 데이터를 불러오지 못했습니다. 새로고침해 주세요.'
              : msg;
      setLoadError(friendly);
    } finally {
      setLoading(false);
    }
  }, [dateFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useNewRequestsRealtime();
  useDashboardRealtime(loadData);

  const handleRefresh = useCallback(() => {
    loadData();
  }, [loadData]);

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

  const formatMoney = (amount: number) => formatCurrency(amount);
  const formatMoneyFull = (amount: number) => formatCurrency(amount);

  const alertItems: {
    label: string;
    link: string;
    count: number | null;
    icon: LucideIcon;
  }[] = [
    { label: '파트너 가입 신청', link: '/admin/partners?status=pending', count: stats.partnerApplicationPendingCount ?? 0, icon: UserCheck },
    { label: '출금 승인 대기', link: '/settlements', count: stats.pendingWithdrawals, icon: Wallet },
    { label: '계좌 인증 대기', link: '/members/realtors?status=account_pending', count: stats.accountPendingCount, icon: Users },
    { label: '문의 답변 대기', link: '/admin/inquiries', count: stats.inquiryPendingCount, icon: MessageSquare },
    { label: '2주 미활동 중개사', link: '/members/realtors?inactive=14', count: stats.inactiveRealtorCount ?? 0, icon: Clock },
  ];

  const statusVariants: Record<HqStatus, 'blue' | 'green' | 'gray' | 'red' | 'purple' | 'yellow'> = {
    unread: 'gray',
    read: 'blue',
    assigned: 'blue',
    settlement_check: 'purple',
    settlement_done: 'green',
    cancelled: 'gray',
    hq_review_needed: 'red',
  };

  /** 전월 대비 트렌드 뱃지 */
  const TrendBadge = ({ current, prev, invertGood = false }: { current: number; prev: number; invertGood?: boolean }) => {
    if (prev === 0) return null;
    const diff = current - prev;
    const pct = Math.abs(Math.round((diff / prev) * 100));
    const isUp = diff > 0;
    const isGood = invertGood ? !isUp : isUp;
    if (Math.abs(diff) < 1) return null;
    return (
      <span className={`inline-flex items-center gap-0.5 text-xs font-medium ${isGood ? 'text-green-600' : 'text-red-500'}`}>
        {isUp ? <TrendingUp className="h-3 w-3" strokeWidth={2.5} /> : <TrendingDown className="h-3 w-3" strokeWidth={2.5} />}
        {pct}%
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{loadError}</p>
          <button
            type="button"
            onClick={handleRefresh}
            className="shrink-0 text-sm font-medium text-red-700 underline"
          >
            재시도
          </button>
        </div>
      )}
      {/* 헤더 */}
      <div className="rounded-2xl border border-gray-200 bg-gray-50 px-5 py-4 sm:px-6 sm:py-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            안녕하세요, {user?.name ?? '관리자'}님
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {today} ({dayName})
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="flex items-center gap-2 self-start rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-gray-50 hover:border-gray-300"
          title={`마지막 새로고침: ${lastRefresh.toLocaleTimeString('ko-KR')}`}
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          title="전체 회원"
          value={(stats.totalMembers ?? 0).toLocaleString()}
          change={stats.membersIncreaseThisMonth}
          icon={Users}
          loading={loading}
          color="brand"
        />
        <StatsCard
          title="활성 파트너"
          value={(stats.partnerCount ?? 0).toLocaleString()}
          icon={Building2}
          loading={loading}
          color="indigo"
        />
        <StatsCard
          title="이번 달 정산"
          value={formatCurrency(stats.thisMonthSettlementAmount ?? 0, true)}
          icon={Wallet}
          loading={loading}
          color="green"
        />
        <StatsCard
          title="이번 달 요청"
          value={(stats.thisMonthRequests ?? 0).toLocaleString()}
          change={stats.requestDiff}
          icon={TrendingUp}
          loading={loading}
          color="amber"
        />
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <UiCard>
          <CardHeader className="flex-row items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              매출 추이
            </h2>
            <PeriodToggle value={chartPeriod} onChange={setChartPeriod} />
          </CardHeader>
          <CardBody>
            {loading ? (
              <Skeleton className="rounded-lg" height={280} />
            ) : chartPeriod !== 'monthly' || revenueChartData.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">
                {chartPeriod !== 'monthly' ? '월별 데이터만 제공됩니다' : '매출 데이터가 없습니다'}
              </div>
            ) : (
              <Chart
                type="composed"
                data={revenueChartData}
                config={{
                  xKey: 'period',
                  bars: [{ dataKey: 'settlement', name: '정산액', color: '#2563EB' }],
                  lines: [
                    { dataKey: 'revenue', name: '매출액', color: '#10B981' },
                    { dataKey: 'commission', name: '수수료', color: '#F59E0B' },
                  ],
                }}
                height={280}
              />
            )}
            <p className="mt-2 text-xs text-gray-400">
              지난 6개월 결제(payments) + DB열람(db_view_payments) 월별 집계
            </p>
          </CardBody>
        </UiCard>
        <UiCard>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">
              정산 상태 분포
            </h2>
          </CardHeader>
          <CardBody>
            {loading ? (
              <Skeleton className="rounded-lg" height={280} />
            ) : settlementDonutData.every((d) => d.value === 0) ? (
              <div className="flex h-[280px] items-center justify-center text-sm text-gray-400">
                정산 데이터가 없습니다
              </div>
            ) : (
              <Chart
                type="donut"
                data={settlementDonutData.filter((d) => d.value > 0)}
                config={{ pieKey: 'value', nameKey: 'name' }}
                height={280}
              />
            )}
          </CardBody>
        </UiCard>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <UiCard>
          <CardHeader>
            <h2 className="text-lg font-semibold text-gray-900">빠른 작업</h2>
          </CardHeader>
          <CardBody className="flex flex-col gap-2">
            <QuickAction
              label="제휴업체 가입 신청"
              count={stats.partnerApplicationPendingCount ?? 0}
              href="/partner-applications"
              icon={UserCheck}
            />
            <QuickAction
              label="출금 승인 대기"
              count={stats.pendingWithdrawals ?? 0}
              href="/settlements"
              icon={Wallet}
            />
            <QuickAction
              label="상담 미배정"
              count={stats.unassignedCount ?? 0}
              href="/requests"
              icon={FileText}
            />
            <QuickAction
              label="계좌 인증 대기"
              count={stats.accountPendingCount ?? 0}
              href="/members/realtors"
              icon={Users}
            />
            <QuickAction
              label="2주 미활동 중개사"
              count={stats.inactiveRealtorCount ?? 0}
              href="/members/realtors?inactive=14"
              icon={Clock}
            />
          </CardBody>
        </UiCard>
        <UiCard>
          <CardHeader className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">최근 서비스 요청</h2>
            <Link href="/requests" className="text-sm text-brand-600 hover:text-brand-700">전체보기 →</Link>
          </CardHeader>
          <CardBody>
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex justify-between gap-2 border-b border-gray-100 pb-2 last:border-0">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : recentRequests.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">최근 요청이 없습니다</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {recentRequests.map((req) => (
                  <li key={req.id} className="flex justify-between gap-2 border-b border-gray-100 pb-2 last:border-0">
                    <span className="text-gray-700 truncate">
                      {req.customer?.name || '-'} — {SERVICE_CATEGORY_LABELS[req.category as ServiceCategory] ?? req.category}
                    </span>
                    <span className="shrink-0 text-gray-400 text-xs">
                      {new Date(req.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </UiCard>
      </section>

      {/* 정보요청 상태별 집계 */}
      <UiCard>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900">카테고리별 상담현황</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              선택 기간: {dateFilterLabel}
              <span className="text-gray-400 ml-1">· 미배정 / 진행중(열람) / 예약완료 / 지연중(구매DB 24h 경과) / 정산확인 / 전체완료</span>
            </p>
          </div>
          <Link href="/requests" className="text-sm text-brand-600 hover:text-brand-700 font-medium">요청 목록 →</Link>
        </CardHeader>
        <CardBody>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            <div className="p-3 rounded-xl border border-gray-400 bg-white ring-1 ring-gray-200/80">
              <div className="text-xs font-medium text-gray-700">미배정</div>
              <div className="text-lg font-bold text-gray-900 mt-0.5">{statusSummary.unassigned}</div>
            </div>
            <div className="p-3 rounded-xl border border-gray-200 bg-white">
              <div className="text-xs font-medium text-gray-500">진행중(열람)</div>
              <div className="text-lg font-bold text-gray-900 mt-0.5">{statusSummary.inProgress}</div>
            </div>
            <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/70">
              <div className="text-xs font-medium text-blue-700">예약완료</div>
              <div className="text-lg font-bold text-blue-800 mt-0.5">{statusSummary.reserved}</div>
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
            <div className="p-3 rounded-xl border border-purple-300 bg-purple-50/70 ring-1 ring-purple-200/80">
              <div className="text-xs font-medium text-purple-700">정산확인</div>
              <div className="text-lg font-bold text-purple-800 mt-0.5">{statusSummary.settlement_check}</div>
            </div>
            <div className="p-3 rounded-xl border border-green-300 bg-green-50/70 ring-1 ring-green-200/80">
              <div className="text-xs font-medium text-green-700">전체완료</div>
              <div className="text-lg font-bold text-green-800 mt-0.5">{statusSummary.settlement_done}</div>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center justify-between gap-2 text-sm">
            <span className="text-gray-500">합계 <strong className="text-gray-700">{statusSummary.total}건</strong></span>
            <span className="font-medium text-gray-700">
              전환률 <strong className="text-brand-600">{statusSummary.total > 0 ? Math.round((statusSummary.settlement_done / statusSummary.total) * 100) : 0}%</strong>
              <span className="text-gray-400 font-normal ml-1">(전체완료 {statusSummary.settlement_done}건 / 요청 {statusSummary.total}건)</span>
            </span>
          </div>
        </CardBody>
      </UiCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 처리 필요 알림 (신규가입 다분화 포함) */}
        <div className="lg:col-span-2">
          <UiCard>
            <CardHeader>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-amber-500" strokeWidth={2} />
                처리 필요 / 신규가입 확인
              </h2>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {alertItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.link}
                    className="flex items-center justify-between p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center">
                        <item.icon className="h-4 w-4 text-gray-500" strokeWidth={2} />
                      </div>
                      <span className="text-sm font-medium text-gray-700">{item.label}</span>
                    </div>
                    {item.count !== null ? (
                      <StatusBadge label={`${item.count}건`} variant="blue" />
                    ) : (
                      <span className="text-xs text-brand-600 font-medium">바로가기 →</span>
                    )}
                  </Link>
                ))}
              </div>
            </CardBody>
          </UiCard>
        </div>

        {/* 대기 현황 사이드 */}
        <UiCard>
          <CardHeader>
            <h2 className="text-lg font-medium text-gray-900">대기 현황</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">출금승인 대기</span>
              <span className="font-medium">{stats.pendingWithdrawals ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">상담 미배정</span>
              <span className="font-medium">{stats.unassignedCount ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">계좌 인증</span>
              <span className="font-medium">{stats.accountPendingCount ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">문의 답변</span>
              <span className="font-medium">{stats.inquiryPendingCount ?? 0}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">2주 미활동 중개사</span>
              <span className="font-medium">{stats.inactiveRealtorCount ?? 0}</span>
            </div>
          </CardBody>
        </UiCard>
      </div>

      {/* 재정 요약 (당월) - 미수금액, 정산액, 공인중개사 배정액(예상), 당월 청구액, 공제후 수익예상 */}
      <UiCard>
        <CardHeader className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">재정 요약 (당월)</h2>
            <p className="text-xs text-gray-400 mt-0.5">미수금액 · 정산액 · 공인중개사 배정액(예상) · 당월 청구액 · 공제후 수익예상 (미수액은 수익에서 제외)</p>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/payments/receivables" className="text-xs text-amber-600 hover:text-amber-700 font-medium">미수금액 체크 및 결제 →</Link>
            <Link href="/admin/settlements" className="text-sm text-brand-600 hover:text-brand-700">정산 관리 →</Link>
          </div>
        </CardHeader>
        <CardBody className="space-y-5">
          {/* 핵심 KPI 5개 */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <Link
              href="/payments/receivables"
              className="group p-4 rounded-xl border border-amber-200 bg-amber-50/40 hover:bg-amber-100/60 transition-colors block"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">미수금액</span>
                <TrendBadge
                  current={stats.financialSummary?.unpaidAmount ?? 0}
                  prev={stats.financialSummary?.prevMonthUnpaidAmount ?? 0}
                  invertGood
                />
              </div>
              <div className="text-2xl font-bold text-amber-700">
                {formatMoney(stats.financialSummary?.unpaidAmount ?? 0)}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">
                {stats.financialSummary?.unpaidCount ?? 0}건 미납
              </div>
            </Link>

            <div className="p-4 rounded-xl border border-green-200 bg-green-50/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">정산액</span>
                <TrendBadge
                  current={stats.financialSummary?.settlementAmount ?? 0}
                  prev={stats.financialSummary?.prevMonthSettlementAmount ?? 0}
                />
              </div>
              <div className="text-2xl font-bold text-green-700">
                {formatMoney(stats.financialSummary?.settlementAmount ?? 0)}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">
                전월: {formatMoney(stats.financialSummary?.prevMonthSettlementAmount ?? 0)}
              </div>
            </div>

            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">공인중개사 배정액(예상)</span>
              </div>
              <div className="text-2xl font-bold text-blue-700">
                {formatMoney(stats.financialSummary?.realtorAssignmentAmount ?? 0)}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">
                예약완료 {stats.financialSummary?.realtorAssignmentCount ?? 0}건 기준
              </div>
            </div>

            <div className="p-4 rounded-xl border border-purple-200 bg-purple-50/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">당월 청구액</span>
              </div>
              <div className="text-2xl font-bold text-purple-700">
                {formatMoney(stats.financialSummary?.realtorMonthlyClaimAmount ?? 0)}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">
                대기 {stats.financialSummary?.realtorClaimPendingCount ?? 0}건
              </div>
            </div>

            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-500">공제후 수익예상</span>
              </div>
              <div className="text-2xl font-bold text-emerald-700">
                {formatMoney(stats.financialSummary?.expectedProfitAfterDeduction ?? 0)}
              </div>
              <div className="text-xs text-gray-400 mt-1.5">미수액 수익 제외</div>
            </div>
          </div>

          {/* 재정 흐름 시각화 */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">당월 재정 흐름</p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 min-w-[120px] text-center p-3 bg-white rounded-lg border border-gray-200">
                <div className="text-xs text-gray-400 mb-1">제휴업체 수납완료</div>
                <div className="text-base font-bold text-gray-800">
                  {formatMoney(stats.financialSummary?.settlementAmount ?? 0)}
                </div>
              </div>
              <div className="flex flex-col items-center gap-0.5 text-gray-300">
                <Minus className="h-4 w-4" strokeWidth={2.5} />
                <ArrowRight className="h-4 w-4" strokeWidth={2} />
              </div>
              <div className="flex-1 min-w-[140px] text-center p-3 bg-purple-50 rounded-lg border border-purple-200">
                <div className="text-xs text-gray-400 mb-1">공인중개사 수수료</div>
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
              <div className="flex flex-col items-center gap-0.5 text-gray-300">
                <span className="text-gray-300 font-light text-lg">=</span>
              </div>
              <div className="flex-1 min-w-[120px] text-center p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                <div className="text-xs text-gray-400 mb-1">순수익 예상</div>
                <div className="text-base font-bold text-emerald-700">
                  {formatMoney(stats.financialSummary?.expectedProfitAfterDeduction ?? 0)}
                </div>
              </div>
              {(stats.financialSummary?.unpaidAmount ?? 0) > 0 && (
                <>
                  <div className="text-gray-300 font-light text-sm">+</div>
                  <div className="flex-1 min-w-[120px] text-center p-3 bg-amber-50 rounded-lg border border-amber-200">
                    <div className="text-xs text-gray-400 mb-1">미수금 회수 예정</div>
                    <div className="text-base font-bold text-amber-600">
                      +{formatMoney(stats.financialSummary?.unpaidAmount ?? 0)}
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {stats.financialSummary?.unpaidCount ?? 0}건 미납
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* 당월 미수 납부 현황 */}
          {(stats.financialSummary?.totalReceivableThisMonth ?? 0) > 0 && (() => {
            const total = stats.financialSummary?.totalReceivableThisMonth ?? 0;
            const paid = stats.financialSummary?.paidReceivableThisMonth ?? 0;
            const paidPct = total > 0 ? Math.round((paid / total) * 100) : 0;
            return (
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-medium text-gray-600">당월 미수 납부 현황</span>
                  <span className="text-gray-400">{paidPct}% 납부 완료</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-2.5">
                  <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${paidPct}%` }} />
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-green-600">납부 완료 {formatMoneyFull(paid)}</span>
                  <span className="font-medium text-gray-500">총 청구 {formatMoneyFull(total)}</span>
                  <span className="text-amber-600">미납 {formatMoneyFull(total - paid)}</span>
                </div>
              </div>
            );
          })()}
        </CardBody>
      </UiCard>

      {/* 카테고리별 상담 현황 테이블 (날짜 필터) */}
      <UiCard>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-lg font-medium text-gray-900">카테고리별 상담 현황</h2>
            <p className="text-xs text-gray-400 mt-0.5">클릭 시 해당 카테고리 미배정 목록으로 이동</p>
          </div>
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value as DashboardDateFilter)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {DATE_FILTER_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </CardHeader>
        <CardBody>
          {/* 미배정 DB 카테고리별 수량 (클릭 시 리스트업) */}
          {(() => {
            const cat = stats.categoryStats ?? {};
            const CATEGORY_KEYS: ServiceCategory[] = ['moving', 'cleaning', 'internet_tv', 'interior', 'appliance_rental', 'kiosk'];
            const hasAnyUnassigned = CATEGORY_KEYS.some((k) => {
              const b = cat[k] as CategoryStatBreakdown | undefined;
              return b && b.unassigned > 0;
            });
            if (!loading && hasAnyUnassigned) {
              return (
                <div className="mb-4 p-3 rounded-xl bg-gray-50 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 mb-2">미배정 DB (카테고리별) — 클릭 시 리스트</p>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_KEYS.map((catKey) => {
                      const b = cat[catKey] as CategoryStatBreakdown | undefined;
                      const count = b?.unassigned ?? 0;
                      if (count === 0) return null;
                      return (
                        <Link
                          key={catKey}
                          href={`/requests?status=unread&category=${catKey}`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-brand-50 hover:border-brand-300 hover:text-brand-700 transition-colors"
                        >
                          {SERVICE_CATEGORY_LABELS[catKey]}
                          <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-bold text-red-600">{count}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            }
            return null;
          })()}
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-3 font-medium">카테고리</th>
                  <th className="pb-3 font-medium text-center">미배정</th>
                  <th className="pb-3 font-medium text-center">진행중(열람)</th>
                  <th className="pb-3 font-medium text-center">예약완료</th>
                  <th className="pb-3 font-medium text-center">지연중</th>
                  <th className="pb-3 font-medium text-center">정산확인</th>
                  <th className="pb-3 font-medium text-center">전체완료</th>
                  <th className="pb-3 font-medium text-right">합계</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  [1, 2, 3, 4].map((i) => (
                    <tr key={i} className="border-b border-gray-100">
                      <td className="py-3"><Skeleton className="h-4 w-20" /></td>
                      {[1,2,3,4,5,6,7].map((j) => (
                        <td key={j} className="py-3 text-center"><Skeleton className="h-4 w-6 mx-auto" /></td>
                      ))}
                    </tr>
                  ))
                ) : (() => {
                  const cat = stats.categoryStats ?? {};
                  const CATEGORY_KEYS: ServiceCategory[] = ['moving', 'cleaning', 'internet_tv', 'interior', 'appliance_rental', 'kiosk'];
                  const rows = CATEGORY_KEYS.map((catKey) => {
                    const b = cat[catKey] as CategoryStatBreakdown | undefined;
                    if (!b || b.total === 0) return null;
                    return (
                      <tr key={catKey} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="py-2.5 font-medium text-gray-900">{SERVICE_CATEGORY_LABELS[catKey]}</td>
                        <td className="py-2.5 text-center tabular-nums">
                          {b.unassigned > 0 ? (
                            <Link href={`/requests?status=unread&category=${catKey}`} className="text-red-600 font-semibold hover:underline">{b.unassigned}</Link>
                          ) : <span className="text-gray-400">-</span>}
                        </td>
                        <td className="py-2.5 text-center tabular-nums text-gray-700">{b.inProgress || <span className="text-gray-400">-</span>}</td>
                        <td className="py-2.5 text-center tabular-nums text-blue-700">{b.reserved || <span className="text-gray-400">-</span>}</td>
                        <td className="py-2.5 text-center tabular-nums text-amber-600">{b.delayed || <span className="text-gray-400">-</span>}</td>
                        <td className="py-2.5 text-center tabular-nums text-purple-700">{b.settlement_check || <span className="text-gray-400">-</span>}</td>
                        <td className="py-2.5 text-center tabular-nums text-green-700">{b.settlement_done || <span className="text-gray-400">-</span>}</td>
                        <td className="py-2.5 text-right tabular-nums font-semibold text-gray-900">{b.total}</td>
                      </tr>
                    );
                  }).filter(Boolean);
                  if (rows.length === 0) {
                    return (
                      <tr>
                        <td colSpan={8} className="py-8 text-center text-gray-400 text-sm">해당 기간 상담 데이터가 없습니다</td>
                      </tr>
                    );
                  }
                  return rows;
                })()}
              </tbody>
            </table>
          </div>
        </CardBody>
      </UiCard>

      {/* 진행중 취소건 / 불만건 리스트 */}
      <UiCard>
        <CardHeader className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" strokeWidth={2} />
              진행중 취소건 / 불만건 리스트
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">취소 건 및 평점 낮은(불만) 유입 건 자동 집계</p>
          </div>
          <Link href="/complaints" className="text-sm text-brand-600 hover:text-brand-700">민원 관리 →</Link>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">고객명</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">연락처</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">카테고리</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">유형</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">제휴업체</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">신청일시</th>
                </tr>
              </thead>
              <tbody>
                {cancelledOrComplaintList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center text-gray-500 py-6">없음</td>
                  </tr>
                ) : (
                  cancelledOrComplaintList.map((item) => (
                    <tr key={item.id} className="border-b border-gray-100">
                      <td className="py-2 px-2 font-medium">{item.customer?.name || '-'}</td>
                      <td className="py-2 px-2">{item.customer?.phone || '-'}</td>
                      <td className="py-2 px-2">{SERVICE_CATEGORY_LABELS[item.category as ServiceCategory]}</td>
                      <td className="py-2 px-2">
                        <StatusBadge
                          label={item.reason === 'complaint' ? '불만' : '취소'}
                          variant={item.reason === 'complaint' ? 'red' : 'gray'}
                        />
                      </td>
                      <td className="py-2 px-2">{item.partner_name || '-'}</td>
                      <td className="py-2 px-2 text-gray-500">{new Date(item.created_at).toLocaleString('ko-KR')}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </UiCard>

      {/* 제휴업체 평점/불만 리스트 */}
      <UiCard>
        <CardHeader className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium text-gray-900">제휴업체 저평점/불만 (자동 리스트업)</h2>
            <p className="text-xs text-gray-500 mt-0.5">평점 낮은순 · 불만 건수 많은순 자동 정렬 (카테고리 통합)</p>
          </div>
          <Link href="/admin/partners" className="text-sm text-brand-600 hover:text-brand-700">제휴업체 목록 →</Link>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">업체명</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">카테고리</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">평균평점</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">리뷰수</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">불만건수</th>
                </tr>
              </thead>
              <tbody>
                {partnersByRating.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-500 py-6">데이터 없음</td>
                  </tr>
                ) : (
                  partnersByRating.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-2 px-2 font-medium">{p.business_name}</td>
                      <td className="py-2 px-2">{(p.service_categories || []).map((c) => SERVICE_CATEGORY_LABELS[c] || c).join(', ') || '-'}</td>
                      <td className="text-right py-2 px-2">{p.avg_rating.toFixed(1)}</td>
                      <td className="text-right py-2 px-2">{p.total_reviews}</td>
                      <td className={`text-right py-2 px-2 ${p.unsatisfied_count > 0 ? 'text-amber-600 font-medium' : ''}`}>
                        {p.unsatisfied_count}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </UiCard>

      {/* 제휴업체 전환률 낮은순 */}
      <UiCard>
        <CardHeader className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium text-gray-900">제휴업체 DB 배정·전환률 (낮은순)</h2>
            <p className="text-xs text-gray-500 mt-0.5">전환 기준: 예약완료 · DB 배정 및 구매 기준</p>
          </div>
          <Link href="/admin/partners" className="text-sm text-brand-600 hover:text-brand-700">제휴업체 목록 →</Link>
        </CardHeader>
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-2 font-medium text-gray-600">업체명</th>
                  <th className="text-left py-2 px-2 font-medium text-gray-600">카테고리</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">배정건수</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">예약완료</th>
                  <th className="text-right py-2 px-2 font-medium text-gray-600">전환률 %</th>
                </tr>
              </thead>
              <tbody>
                {partnersByConversion.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center text-gray-500 py-6">데이터 없음</td>
                  </tr>
                ) : (
                  partnersByConversion.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-2 px-2 font-medium">{p.business_name}</td>
                      <td className="py-2 px-2">{(p.service_categories || []).map((c) => SERVICE_CATEGORY_LABELS[c] || c).join(', ') || '-'}</td>
                      <td className="text-right py-2 px-2">{p.assigned_count}</td>
                      <td className="text-right py-2 px-2">{p.reserved_count}</td>
                      <td className={`text-right py-2 px-2 ${p.conversion_rate < 50 ? 'text-amber-600 font-medium' : ''}`}>
                        {p.conversion_rate}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardBody>
      </UiCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 상위 중개사 랭킹 */}
        <UiCard>
          <CardHeader className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">상위 중개사 랭킹 (이번달 리드 전환)</h2>
            <Link href="/members/realtors" className="text-sm text-brand-600 hover:text-brand-700">전체보기 →</Link>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-600">업체명</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-600">전환건수</th>
                    <th className="text-right py-2 px-2 font-medium text-gray-600">수익금</th>
                  </tr>
                </thead>
                <tbody>
                  {(stats.topRealtors ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-center text-gray-500 py-6">데이터 없음</td>
                    </tr>
                  ) : (
                    stats.topRealtors.map((r, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-2 px-2 font-medium">{r.business_name}</td>
                        <td className="text-right py-2 px-2">{r.conversionCount}건</td>
                        <td className="text-right py-2 px-2">{r.amount != null ? formatMoney(r.amount) : '-'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </UiCard>

        {/* 최근 서비스 요청 */}
        <UiCard>
          <CardHeader className="flex justify-between items-center">
            <h2 className="text-lg font-medium text-gray-900">최근 서비스 요청</h2>
            <Link href="/requests" className="text-sm text-brand-600 hover:text-brand-700">전체보기 →</Link>
          </CardHeader>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-2 px-2 font-medium text-gray-600">고객명</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">연락처</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">카테고리</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">상태</th>
                    <th className="text-left py-2 px-2 font-medium text-gray-600">신청일시</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRequests.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center text-gray-500 py-8">최근 요청이 없습니다</td>
                    </tr>
                  ) : (
                    recentRequests.map((request) => (
                      <tr key={request.id} className="border-b border-gray-100">
                        <td className="py-2 px-2 font-medium">{request.customer?.name || '-'}</td>
                        <td className="py-2 px-2">{request.customer?.phone || '-'}</td>
                        <td className="py-2 px-2">{SERVICE_CATEGORY_LABELS[request.category as ServiceCategory]}</td>
                        <td className="py-2 px-2">
                          <StatusBadge
                            label={HQ_STATUS_LABELS[request.hq_status as HqStatus]}
                            variant={statusVariants[request.hq_status as keyof typeof statusVariants] ?? 'gray'}
                          />
                        </td>
                        <td className="py-2 px-2 text-gray-500">
                          {new Date(request.created_at).toLocaleString('ko-KR')}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardBody>
        </UiCard>
      </div>
    </div>
  );
}
