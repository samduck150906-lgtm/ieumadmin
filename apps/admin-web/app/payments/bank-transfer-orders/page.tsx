'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, RefreshCw, Wallet, FileText } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getWithdrawalRequestsPersonal } from '@/lib/api/settlements';
import { logger } from '@/lib/logger';
import type { WithdrawalStatus } from '@/types/database';

const STATUS_LABELS: Record<string, string> = {
  requested: '신청',
  approved: '승인',
  completed: '완료',
  rejected: '반려',
};

const STATUS_VARIANTS: Record<string, 'yellow' | 'blue' | 'green' | 'red'> = {
  requested: 'yellow',
  approved: 'blue',
  completed: 'green',
  rejected: 'red',
};

const FILTER_CHIPS = [
  { value: '', label: '전체' },
  { value: 'requested', label: '신청' },
  { value: 'approved', label: '승인' },
  { value: 'completed', label: '완료' },
  { value: 'rejected', label: '반려' },
];

export default function BankTransferOrdersPage() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getWithdrawalRequestsPersonal({
        page,
        limit: 20,
        status: (statusFilter as WithdrawalStatus) || undefined,
      });
      setList(result.data ?? []);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      logger.error('무통장입금 개인 주문 내역 로드 오류', err);
      setLoadError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      setList([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const formatMoney = (n: number) => new Intl.NumberFormat('ko-KR').format(n) + '원';
  const formatDate = (v: string | null) =>
    v ? new Date(v).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';

  return (
    <AdminLayout>
      <div className="space-y-6">
        {loadError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <Button variant="secondary" size="sm" onClick={() => { setLoadError(null); loadData(); }}>
              재시도
            </Button>
          </div>
        )}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">무통장입금 개인 주문 내역</h1>
            <p className="mt-1 text-sm text-gray-500">개인(비사업자) 회원 출금 신청 내역 (P.34)</p>
          </div>
          <div className="flex gap-2">
            <Link href="/settlements">
              <Button variant="secondary" size="sm">
                <FileText className="h-4 w-4 mr-2" />
                정산 관리로 이동
              </Button>
            </Link>
            <Button variant="secondary" disabled={loading} onClick={() => loadData()}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        </div>

        <Card>
          <CardBody className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {FILTER_CHIPS.map(({ value, label }) => (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => { setStatusFilter(value); setPage(1); }}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                    statusFilter === value
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <Wallet className="h-12 w-12 text-slate-300 mb-3" />
              <p className="font-medium">개인 출금 신청 내역이 없습니다</p>
              <p className="text-sm mt-1">필터를 변경해보세요</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청일</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">공인중개사</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청금액</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">실지급액(원천세 3.3% 공제)</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">은행/계좌</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {list.map((w: any) => {
                    const realtor = w.realtor ?? {};
                    const netAmount = Math.floor((w.amount ?? 0) * 0.967);
                    return (
                      <tr key={w.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600">{formatDate(w.created_at)}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className="font-medium text-gray-900">{realtor.business_name ?? '-'}</span>
                          {realtor.contact_name && (
                            <span className="block text-xs text-gray-500">{realtor.contact_name}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatMoney(w.amount ?? 0)}</td>
                        <td className="px-4 py-3 text-sm text-gray-700">{formatMoney(netAmount)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {w.bank_name ?? '-'} {w.account_number ?? ''}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={STATUS_LABELS[w.status] ?? w.status}
                            variant={STATUS_VARIANTS[w.status] ?? 'gray'}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">총 {total}건</p>
              <div className="flex gap-2 items-center">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium text-gray-700 min-w-[80px] text-center">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
