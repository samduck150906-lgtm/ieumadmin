'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ChevronLeft, Search, Download } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { getLeadStatsDaily, getLeadStatsMonthly } from '@/lib/api/lead-stats';
import type { LeadStatsDailyItem, LeadStatsMonthlyItem } from '@/lib/api/lead-stats';
import { logger } from '@/lib/logger';
import { withTimeout, DATA_FETCH_TIMEOUT_MS } from '@/lib/timeout';

function downloadCsv(filename: string, rows: string[][]) {
  const BOM = '\uFEFF';
  const csv = BOM + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i);
const MONTHS = Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: `${i + 1}월` }));

export default function LeadStatsPage() {
  const [tab, setTab] = useState<'daily' | 'monthly'>('monthly');
  const [year, setYear] = useState(CURRENT_YEAR);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [loading, setLoading] = useState(false);
  const [dailyData, setDailyData] = useState<LeadStatsDailyItem[]>([]);
  const [dailyTotal, setDailyTotal] = useState(0);
  const [dailyPage, setDailyPage] = useState(1);
  const [dailyTotalPages, setDailyTotalPages] = useState(1);
  const [monthlyData, setMonthlyData] = useState<LeadStatsMonthlyItem[]>([]);

  const loadDaily = useCallback(async () => {
    setLoading(true);
    try {
      const res = await withTimeout(
        getLeadStatsDaily({ year, month, page: dailyPage, limit: 20 }),
        DATA_FETCH_TIMEOUT_MS
      );
      setDailyData(res.data);
      setDailyTotal(res.total);
      setDailyTotalPages(res.totalPages);
    } catch (e) {
      logger.error('가망고객 일별 조회 오류', e);
    } finally {
      setLoading(false);
    }
  }, [year, month, dailyPage]);

  const loadMonthly = useCallback(async () => {
    setLoading(true);
    try {
      const res = await withTimeout(
        getLeadStatsMonthly({ year }),
        DATA_FETCH_TIMEOUT_MS
      );
      setMonthlyData(res.data);
    } catch (e) {
      logger.error('가망고객 월별 조회 오류', e);
    } finally {
      setLoading(false);
    }
  }, [year]);

  const onSearch = useCallback(async () => {
    if (tab === 'daily') {
      setDailyPage(1);
      setLoading(true);
      try {
        const res = await withTimeout(
          getLeadStatsDaily({ year, month, page: 1, limit: 20 }),
          DATA_FETCH_TIMEOUT_MS
        );
        setDailyData(res.data);
        setDailyTotal(res.total);
        setDailyTotalPages(res.totalPages);
      } catch (e) {
        logger.error('가망고객 일별 조회 오류', e);
      } finally {
        setLoading(false);
      }
    } else {
      loadMonthly();
    }
  }, [tab, year, month, loadMonthly]);

  useEffect(() => {
    if (tab === 'daily') loadDaily();
    else loadMonthly();
  }, [tab, year, month, dailyPage, loadDaily, loadMonthly]);

  const handleMonthRowClick = (monthValue: number) => {
    setMonth(monthValue);
    setDailyPage(1);
    setTab('daily');
  };

  const formatRegisteredAt = (v: string) => {
    const d = new Date(v);
    return d.toLocaleString('ko-KR', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(/\. /g, '-').replace('. ', ' ');
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link
            href="/customers"
            className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label="뒤로"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">가망 고객 DB</h1>
            <p className="text-sm text-gray-500">리드통계 · 일별/월별 가망고객 DB 내역 조회</p>
          </div>
        </div>

        <Card className="overflow-hidden">
          <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <select
                className="input w-28"
                value={year}
                onChange={(e) => setYear(Number(e.target.value))}
                aria-label="연도"
              >
                {YEARS.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
              {tab === 'daily' && (
                <select
                  className="input w-24"
                  value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  aria-label="월"
                >
                  {MONTHS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              )}
              {tab === 'monthly' && (
                <span className="text-sm text-gray-500">월: 전체</span>
              )}
              <Button variant="primary" type="button" onClick={onSearch}>
                <Search className="h-4 w-4 mr-2" />
                검색
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => {
                  if (tab === 'daily') {
                    const rows: string[][] = [
                      ['등록일자', '고객명', '휴대번호'],
                      ...dailyData.map((r) => [formatRegisteredAt(r.registeredAt), r.name, r.phone]),
                    ];
                    downloadCsv(`가망고객DB_일별_${year}_${month}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
                  } else {
                    const rows: string[][] = [
                      ['년도월', '신규 가망DB', '누적 가망DB'],
                      ...monthlyData.map((r) => [r.yearMonth, String(r.newCount), String(r.cumulativeCount)]),
                    ];
                    downloadCsv(`가망고객DB_월별_${year}_${new Date().toISOString().slice(0, 10)}.csv`, rows);
                  }
                }}
                disabled={loading}
              >
                <Download className="h-4 w-4 mr-2" />
                현재 결과 내보내기(CSV)
              </Button>
            </div>
          </div>

          <div className="flex border-b border-gray-200">
            <button
              type="button"
              onClick={() => setTab('daily')}
              className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px ${
                tab === 'daily'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              일별
            </button>
            <button
              type="button"
              onClick={() => setTab('monthly')}
              className={`px-6 py-3 text-sm font-medium border-b-2 -mb-px ${
                tab === 'monthly'
                  ? 'border-brand-600 text-brand-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              월별
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-gray-500">로딩 중...</div>
          ) : tab === 'daily' ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">등록일자</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">고객명</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">휴대번호</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {dailyData.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                          해당 기간 등록 내역이 없습니다.
                        </td>
                      </tr>
                    ) : (
                      dailyData.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                            {formatRegisteredAt(row.registeredAt)}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{row.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.phone}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {dailyTotalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
                  <p className="text-sm text-gray-600">
                    전체 {dailyTotal}명 중 {(dailyPage - 1) * 20 + 1}–{Math.min(dailyPage * 20, dailyTotal)}명
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => setDailyPage((p) => Math.max(1, p - 1))}
                      disabled={dailyPage <= 1}
                    >
                      이전
                    </Button>
                    <span className="flex items-center px-3 text-sm text-gray-600">
                      {dailyPage} / {dailyTotalPages}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      type="button"
                      onClick={() => setDailyPage((p) => Math.min(dailyTotalPages, p + 1))}
                      disabled={dailyPage >= dailyTotalPages}
                    >
                      다음
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">년도월</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">신규 가망DB</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">누적 가망DB</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {monthlyData.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                        해당 연도 데이터가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    monthlyData.map((row) => {
                      const monthNum = parseInt(row.yearMonth.replace(/년\s*(\d+)월/, '$1'), 10);
                      return (
                        <tr
                          key={row.yearMonth}
                          onClick={() => handleMonthRowClick(monthNum)}
                          className="hover:bg-brand-50 cursor-pointer"
                        >
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.yearMonth}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.newCount}명</td>
                          <td className="px-4 py-3 text-sm text-gray-600">{row.cumulativeCount}명</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
