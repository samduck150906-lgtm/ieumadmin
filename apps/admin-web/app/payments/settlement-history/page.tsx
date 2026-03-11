'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, Search } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth';
import { showError } from '@/lib/toast';

const PAGE_SIZE = 15;

interface DailyRow {
  date: string;
  conversionAmount: number;
  referralAmount: number;
  totalAmount: number;
}

interface MonthlyRow {
  month: string;
  totalRevenue: number;
  referrerPayout: number;
  settlementRevenue: number;
}

export default function SettlementHistoryPage() {
  const { session } = useAuth();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | ''>(now.getMonth() + 1);
  const [view, setView] = useState<'daily' | 'monthly'>('daily');
  const [dailyData, setDailyData] = useState<DailyRow[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  const formatMoney = (n: number) => `₩${new Intl.NumberFormat('ko-KR').format(n)}`;

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ year: String(year), view });
      const monthNum = view === 'daily' ? (month !== '' ? month : new Date().getMonth() + 1) : month;
      if (view === 'daily') params.set('month', String(monthNum));
      if (view === 'monthly' && monthNum !== '') params.set('month', String(monthNum));
      const res = await fetch(`/api/admin/settlement-revenue?${params}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '조회 실패');
      if (data.view === 'daily') {
        setDailyData(Array.isArray(data.data) ? data.data : []);
        setMonthlyData([]);
      } else {
        setMonthlyData(Array.isArray(data.data) ? data.data : []);
        setDailyData([]);
      }
      setPage(1);
    } catch {
      setDailyData([]);
      setMonthlyData([]);
      showError('정산 내역을 불러오지 못했습니다. 새로고침해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, year, month, view]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSearch = () => {
    loadData();
  };

  const list = view === 'daily' ? dailyData : monthlyData;
  const totalPages = Math.ceil(list.length / PAGE_SIZE) || 1;
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pagedList = list.slice(start, start + PAGE_SIZE);

  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - i);
  const months = [
    { value: '', label: '전체' },
    ...Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: `${i + 1}월`,
    })),
  ];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/payments" className="p-1 rounded hover:bg-gray-100">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">수익금 정산 내역</h1>
            <p className="text-sm text-gray-500">리드관리 · 일별/월별 전환·추천 수익금 및 정산수익금</p>
          </div>
        </div>

        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">연도</label>
                <select
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value, 10))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}년
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">월</label>
                <select
                  value={month}
                  onChange={(e) => setMonth(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm min-w-[80px]"
                >
                  {months.map((mo) => (
                    <option key={mo.value || 'all'} value={mo.value}>
                      {mo.label}
                    </option>
                  ))}
                </select>
              </div>
              <Button variant="secondary" size="sm" onClick={handleSearch} disabled={loading}>
                <Search className="h-4 w-4 mr-1" />
                검색
              </Button>
              <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            <div className="flex border-b border-gray-200">
              <button
                type="button"
                onClick={() => setView('daily')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  view === 'daily'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                일별
              </button>
              <button
                type="button"
                onClick={() => setView('monthly')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                  view === 'monthly'
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                월별
              </button>
            </div>
          </CardBody>
        </Card>

        <Card>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : view === 'daily' ? (
            <>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>일자별</th>
                      <th className="text-right">전환</th>
                      <th className="text-right">추천</th>
                      <th className="text-right">수익금 합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-gray-500 py-8">
                          해당 조건의 일별 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      (pagedList as DailyRow[]).map((row) => (
                        <tr key={row.date}>
                          <td className="font-medium">{row.date.slice(5).replace('-', '-')}</td>
                          <td className="text-right">{formatMoney(row.conversionAmount)}</td>
                          <td className="text-right">{formatMoney(row.referralAmount)}</td>
                          <td className="text-right font-semibold">{formatMoney(row.totalAmount)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {list.length > PAGE_SIZE && (
                <div className="p-3 border-t flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-500">
                    {start + 1}-{Math.min(start + PAGE_SIZE, list.length)} / {list.length}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                    >
                      이전
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      다음
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>월</th>
                      <th className="text-right">총 수익금</th>
                      <th className="text-right">추천인 지급금</th>
                      <th className="text-right">정산수익금</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedList.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center text-gray-500 py-8">
                          해당 조건의 월별 데이터가 없습니다.
                        </td>
                      </tr>
                    ) : (
                      (pagedList as MonthlyRow[]).map((row) => (
                        <tr key={row.month}>
                          <td className="font-medium">{row.month.replace('-', '년 ')}월</td>
                          <td className="text-right">{formatMoney(row.totalRevenue)}</td>
                          <td className="text-right">{formatMoney(row.referrerPayout)}</td>
                          <td className="text-right font-semibold">{formatMoney(row.settlementRevenue)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {list.length > PAGE_SIZE && (
                <div className="p-3 border-t flex items-center justify-between gap-2">
                  <span className="text-sm text-gray-500">
                    {start + 1}-{Math.min(start + PAGE_SIZE, list.length)} / {list.length}
                  </span>
                  <div className="flex gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage <= 1}
                    >
                      이전
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage >= totalPages}
                    >
                      다음
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>

        <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-sm text-gray-600">
          <p className="font-medium text-gray-700 mb-1">참고</p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>총 수익금 = 전환 수익금 + 추천 수익금 (수수료 발생 기준)</li>
            <li>추천인 지급금 = 피추천인 수익금(상담요청 수수료 + 전체완료 수수료)의 5%</li>
            <li>추천 수익 적용 기간: 추천 및 가입일로부터 1년간</li>
            <li>정산수익금 = 총 수익금 − 추천인 지급금</li>
          </ul>
        </div>

        <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-700">
          <p className="font-medium text-blue-800 mb-1">추천 수수료 상세 관리</p>
          <p>추천인별 수수료 내역, 추천 관계 현황, 활성/만료 상태 등은{' '}
            <Link href="/admin/referral-commissions" className="text-blue-600 underline font-medium hover:text-blue-800">
              추천 수수료 관리
            </Link>
            {' '}페이지에서 확인하세요.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
}
