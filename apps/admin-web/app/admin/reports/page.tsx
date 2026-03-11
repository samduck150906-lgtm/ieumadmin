'use client';

/**
 * 리포트 페이지 — 보안: 클라이언트에서 getSupabase를 사용하지 않고
 * /api/admin/reports 서버 API만 호출. Supabase 접근은 서버에서만 수행됨.
 */
import { useState, useEffect, useCallback } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { BarChart3, TrendingUp, Users, DollarSign, RefreshCw, Download, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatCurrency } from '@/utils/format';

interface MonthlyStats {
  yearMonth: string;
  newRequests: number;
  completedRequests: number;
  settlementAmount: number;
  newPartners: number;
  newRealtors: number;
}

interface SummaryStats {
  totalPartners: number;
  totalRealtors: number;
  totalRequests: number;
  completedRequests: number;
  totalSettlement: number;
  pendingWithdrawals: number;
  avgConversionRate: number;
}

interface ReportsResponse {
  summary: SummaryStats;
  monthlyStats: MonthlyStats[];
}

const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function StatCard({
  title,
  value,
  sub,
  icon: Icon,
  trend,
  color = 'blue',
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: { value: number; label: string };
  color?: 'blue' | 'green' | 'purple' | 'orange';
}) {
  const colors = {
    blue: 'bg-blue-50 text-blue-600',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
  };
  return (
    <Card>
      <CardBody className="flex items-start gap-4">
        <div className={`p-2.5 rounded-xl flex-shrink-0 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-gray-500 mb-0.5">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{value}</p>
          {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
          {trend && (
            <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend.value >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {trend.value >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
              <span>{Math.abs(trend.value)}% {trend.label}</span>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default function AdminReportsPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [monthlyStats, setMonthlyStats] = useState<MonthlyStats[]>([]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/admin/reports?year=${year}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      const { summary: s, monthlyStats: m } = (await res.json()) as ReportsResponse;
      setSummary(s);
      setMonthlyStats(m);
    } catch (e) {
      console.error('리포트 조회 오류', e);
      setLoadError(e instanceof Error ? e.message : '리포트를 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => { loadStats(); }, [loadStats]);

  const exportCsv = () => {
    const BOM = '\uFEFF';
    const headers = ['월', '신규 요청', '완료(정산완료)', '정산 수납액', '신규 파트너', '신규 중개사'];
    const rows = monthlyStats.map((m) => [
      m.yearMonth,
      String(m.newRequests),
      String(m.completedRequests),
      String(m.settlementAmount),
      String(m.newPartners),
      String(m.newRealtors),
    ]);
    const csv = BOM + [headers, ...rows].map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `이음_리포트_${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const maxRequests = Math.max(...monthlyStats.map((m) => m.newRequests), 1);
  const YEARS = Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - i);

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-4">
          <span>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={() => { setLoadError(null); loadStats(); }}>
            재시도
          </Button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">리포트</h1>
          <p className="text-sm text-gray-500 mt-1">서비스 요청·파트너·정산 연간 통계</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input w-28"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            aria-label="연도"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}년</option>)}
          </select>
          <Button variant="secondary" onClick={loadStats} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            새로고침
          </Button>
          <Button variant="secondary" onClick={exportCsv} disabled={loading || monthlyStats.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
        </div>
      </div>

      {/* 요약 카드 */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardBody><div className="h-20 bg-gray-100 rounded-lg animate-pulse" /></CardBody></Card>
          ))}
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard title="총 서비스 요청" value={summary.totalRequests.toLocaleString()} sub={`완료 ${summary.completedRequests}건`} icon={BarChart3} color="blue" />
          <StatCard title="전환율 (완료/요청)" value={`${summary.avgConversionRate}%`} sub={`${year}년 기준`} icon={TrendingUp} color="green" />
          <StatCard title="파트너 / 중개사" value={`${summary.totalPartners} / ${summary.totalRealtors}`} sub="누적 회원수" icon={Users} color="purple" />
          <StatCard title="연간 정산 수납액" value={formatCurrency(summary.totalSettlement)} sub={`출금 대기 ${summary.pendingWithdrawals}건`} icon={DollarSign} color="orange" />
        </div>
      )}

      {/* 월별 서비스 요청 차트 */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">월별 서비스 요청 현황</h2>
        </div>
        <CardBody>
          {loading ? (
            <div className="h-48 bg-gray-50 rounded-lg animate-pulse" />
          ) : (
            <div className="overflow-x-auto">
              <div className="flex items-end gap-2 min-w-full" style={{ height: 200 }}>
                {monthlyStats.map((m, i) => {
                  const heightPct = maxRequests > 0 ? (m.newRequests / maxRequests) * 100 : 0;
                  const completedPct = m.newRequests > 0 ? (m.completedRequests / m.newRequests) * 100 : 0;
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-[32px]">
                      <span className="text-[10px] text-gray-500 tabular-nums">{m.newRequests}</span>
                      <div className="w-full relative rounded-t-sm overflow-hidden bg-blue-100" style={{ height: `${Math.max(heightPct * 1.5, 4)}px` }}>
                        <div
                          className="absolute bottom-0 left-0 right-0 bg-blue-500 rounded-t-sm transition-all"
                          style={{ height: `${completedPct}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-400">{MONTH_LABELS[i]}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-100 inline-block" />전체 요청</span>
                <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" />완료(정산완료)</span>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* 월별 상세 테이블 */}
      <Card>
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">월별 상세</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {['월', '신규 요청', '완료', '전환율', '정산 수납액', '신규 파트너', '신규 중개사'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 7 }).map((__, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : monthlyStats.map((m, i) => {
                const rate = m.newRequests > 0 ? Math.round((m.completedRequests / m.newRequests) * 100) : 0;
                return (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{m.yearMonth}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 tabular-nums">{m.newRequests.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-900 tabular-nums">{m.completedRequests.toLocaleString()}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`font-medium ${rate >= 50 ? 'text-green-600' : rate >= 20 ? 'text-yellow-600' : 'text-gray-500'}`}>{rate}%</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 tabular-nums">{formatCurrency(m.settlementAmount)}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">{m.newPartners}</td>
                    <td className="px-4 py-3 text-sm text-gray-600 tabular-nums">{m.newRealtors}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
