'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useSettlementList } from '@/hooks/useSettlements';
import type { ReceivableStats } from '@/lib/api/payments';
import { formatCurrency, formatDate, formatMoney } from '@/utils/format';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import type { Settlement } from '@/types/settlement';
import type { StatusType } from '@/types/common';
import { useAuth } from '@/lib/auth';
import { showError } from '@/lib/toast';
import { Wallet, MoreHorizontal, RefreshCw, AlertCircle, CreditCard, Building2, Calendar, CheckCircle2, Clock, Download } from 'lucide-react';

/** DB에서 가져온 미수금 단건 (결제 여부와 무관하게 전산 데이터) */
interface ReceivableRow {
  id: string;
  amount: number;
  service_request_id: string;
  assignment_id?: string;
  receivable_month: string;
  partner_id: string;
  is_paid: boolean;
  paid_at?: string | null;
  payment_request_id?: string | null;
  partner?: { id: string; business_name?: string } | null;
}

export default function AdminSettlementsPage() {
  const { session } = useAuth();
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const [receivableStats, setReceivableStats] = useState<ReceivableStats | null>(null);
  const [receivablesList, setReceivablesList] = useState<ReceivableRow[]>([]);
  const [receivablesLoading, setReceivablesLoading] = useState(true);

  const params = useMemo(() => ({ page, limit: 20, status: (status || undefined) as StatusType | undefined }), [page, status]);
  const { data, isLoading, isError, error, refetch } = useSettlementList(params);

  const authHeaders = useMemo((): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  }), [session?.access_token]);

  const loadReceivableStats = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch('/api/admin/receivables-stats', { headers: authHeaders });
      const json = await res.json().catch(() => ({}));
      if (json && typeof json.totalAmount === 'number') {
        setReceivableStats(json);
      } else if (!res.ok) {
        showError(json?.error || '미수 통계를 불러오지 못했습니다. 새로고침해 주세요.');
      }
    } catch {
      showError('미수 통계를 불러오지 못했습니다. 새로고침해 주세요.');
    }
  }, [session?.access_token, authHeaders]);

  /** DB에서 미수금 전체 목록 조회 — 실제 결제 여부와 무관하게 전산 데이터를 테이블에 표시 */
  const loadReceivablesList = useCallback(async () => {
    if (!session?.access_token) return;
    setReceivablesLoading(true);
    try {
      const res = await fetch('/api/admin/receivables', { headers: authHeaders });
      const json = await res.json().catch(() => ({}));
      const list = Array.isArray(json?.data) ? json.data : [];
      setReceivablesList(list);
      if (!res.ok) showError(json?.error || '미수금 목록을 불러오지 못했습니다. 새로고침해 주세요.');
    } catch {
      setReceivablesList([]);
      showError('미수금 목록을 불러오지 못했습니다. 새로고침해 주세요.');
    } finally {
      setReceivablesLoading(false);
    }
  }, [session?.access_token, authHeaders]);

  useEffect(() => {
    if (session?.access_token) loadReceivableStats();
  }, [session?.access_token, loadReceivableStats]);

  useEffect(() => {
    if (session?.access_token) {
      loadReceivablesList();
    } else {
      setReceivablesLoading(false);
    }
  }, [session?.access_token, loadReceivablesList]);

  const columns: ColumnDef<Settlement>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: '정산번호',
        cell: ({ getValue }) => `STL-${String(getValue()).replace('stl-', '')}`,
      },
      {
        accessorKey: 'partnerName',
        header: '파트너명',
        cell: ({ row }) => (
          <Link href={`/admin/partners/${row.original.partnerId}`} className="text-brand-600 hover:underline">
            {row.original.partnerName}
          </Link>
        ),
      },
      {
        id: 'period',
        header: '정산기간',
        cell: ({ row }) =>
          `${formatDate(row.original.period.startDate, 'dot')}~${formatDate(row.original.period.endDate, 'dot')}`,
      },
      {
        accessorKey: 'amount',
        header: '정산액',
        cell: ({ getValue }) => <span className="tabular-nums">{formatCurrency(Number(getValue()))}</span>,
      },
      {
        accessorKey: 'fee',
        header: '수수료',
        cell: ({ getValue }) => <span className="tabular-nums text-gray-500">{formatCurrency(Number(getValue()))}</span>,
      },
      {
        accessorKey: 'netAmount',
        header: '실지급액',
        cell: ({ getValue }) => <span className="tabular-nums font-medium">{formatCurrency(Number(getValue()))}</span>,
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ getValue }) => <StatusBadge status={String(getValue())} type="settlement" />,
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link href={`/admin/settlements/${row.original.id}`} className="p-1 rounded hover:bg-gray-100" aria-label="상세">
            <MoreHorizontal className="h-4 w-4" />
          </Link>
        ),
      },
    ],
    []
  );

  const tableData = data?.data ?? [];
  const meta = data?.meta;
  const exportCsv = () => {
    const BOM = '\uFEFF';
    const headers = ['정산번호', '파트너명', '정산기간', '정산액', '수수료', '실지급액', '상태'];
    const rows = tableData.map((s: Settlement) => [
      `STL-${String(s.id).replace('stl-', '')}`,
      s.partnerName ?? '',
      s.period ? `${formatDate(s.period.startDate, 'dot')}~${formatDate(s.period.endDate, 'dot')}` : '',
      formatCurrency(Number(s.amount ?? 0)),
      formatCurrency(Number(s.fee ?? 0)),
      formatCurrency(Number(s.netAmount ?? 0)),
      s.status ?? '',
    ]);
    const csv = BOM + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `정산목록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const pagination = meta ? { pageIndex: meta.page - 1, pageSize: meta.limit } : { pageIndex: 0, pageSize: 20 };
  const onPaginationChange = (updaterOrValue: Updater<PaginationState>) => {
    const next = typeof updaterOrValue === 'function' ? updaterOrValue(pagination) : updaterOrValue;
    setPage(next.pageIndex + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">정산 관리</h1>
        <div className="flex gap-2">
          {/* CSV: 로딩과 무관하게 항상 클릭 가능 */}
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4 mr-2" />
            현재 목록 내보내기(CSV)
          </Button>
          <Link href="/payments/receivables">
            <Button variant="secondary">
              <CreditCard className="h-4 w-4 mr-2" />
              미수금액 체크 및 결제
            </Button>
          </Link>
          <Link href="/admin/settlements/new">
            <Button>수동 정산 생성</Button>
          </Link>
        </div>
      </div>

      {/* 미수금 요약 카드 — 총 미수 금액 / 미수 업체 수 / 전월 미수 / 당월 미수 */}
      {receivableStats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link
            href="/payments/receivables"
            className="bg-white rounded-xl border-2 border-amber-200 p-4 flex items-center gap-3 hover:bg-amber-50/60 transition-colors"
          >
            <div className="p-2 bg-amber-50 rounded-lg">
              <AlertCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">총 미수 금액</p>
              <p className="text-lg font-bold text-amber-700">{formatMoney(receivableStats.totalAmount)}</p>
              <p className="text-xs text-gray-400">{receivableStats.totalCount}건</p>
            </div>
          </Link>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg">
              <Building2 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">미수 업체 수</p>
              <p className="text-lg font-bold text-blue-700">{receivableStats.partnerCount}개</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="p-2 bg-purple-50 rounded-lg">
              <Calendar className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">전월 미수 금액</p>
              <p className="text-lg font-bold text-purple-700">{formatCurrency(receivableStats.lastMonthAmount)}</p>
              <p className="text-xs text-gray-400">{receivableStats.lastMonthCount}건</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg">
              <Wallet className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-gray-500">당월 미수 금액</p>
              <p className="text-lg font-bold text-green-700">{formatCurrency(receivableStats.thisMonthAmount)}</p>
              <p className="text-xs text-gray-400">{receivableStats.thisMonthCount}건</p>
            </div>
          </div>
        </div>
      )}

      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-800">{error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
          </Button>
        </div>
      )}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => { setStatus(''); setPage(1); }}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${!status ? 'bg-brand-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              전체
            </button>
            {['pending', 'processing', 'completed', 'failed'].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => { setStatus(s); setPage(1); }}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${status === s ? 'bg-brand-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                {s === 'pending' ? '대기' : s === 'processing' ? '처리중' : s === 'completed' ? '완료' : '실패'}
              </button>
            ))}
          </div>
          <DataTable<Settlement>
            columns={columns}
            data={tableData}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            pageCount={meta?.totalPages}
            emptyMessage="조건에 맞는 정산이 없습니다."
            onRetry={() => refetch()}
          />
        </CardBody>
      </Card>

      {/* 미수금 현황 (DB 기준) — 실제 결제 여부와 무관하게 DB 미수금 데이터를 테이블에 표시. 돈 계산이 되는 전산임을 보여줌 */}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">미수금 현황 (DB 기준)</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                실제 결제가 되지 않았더라도 DB에 적재된 미수금 데이터입니다. 금액·업체·발생월이 전산으로 집계됩니다.
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => { loadReceivablesList(); loadReceivableStats(); }} disabled={receivablesLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${receivablesLoading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
          {receivablesLoading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
            </div>
          ) : receivablesList.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              DB에 등록된 미수금이 없습니다.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="text-left py-3 px-3 font-medium text-gray-700">업체명</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-700">발생월</th>
                    <th className="text-right py-3 px-3 font-medium text-gray-700">금액</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-700">결제 상태</th>
                    <th className="text-left py-3 px-3 font-medium text-gray-700">상담</th>
                  </tr>
                </thead>
                <tbody>
                  {receivablesList.map((r) => {
                    const businessName = r.partner && typeof r.partner === 'object'
                      ? String((r.partner as { business_name?: string }).business_name ?? '-')
                      : '-';
                    return (
                      <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="py-2.5 px-3 font-medium text-gray-900">{businessName}</td>
                        <td className="py-2.5 px-3 text-gray-600">{r.receivable_month ? String(r.receivable_month).slice(0, 7) : '-'}</td>
                        <td className="py-2.5 px-3 text-right font-semibold tabular-nums">{formatCurrency(Number(r.amount ?? 0))}</td>
                        <td className="py-2.5 px-3">
                          {r.is_paid ? (
                            <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                              <CheckCircle2 className="w-3 h-3" /> 수납완료
                            </span>
                          ) : r.payment_request_id ? (
                            <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                              <Clock className="w-3 h-3" /> 청구중
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                              <AlertCircle className="w-3 h-3" /> 미청구
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          {r.service_request_id ? (
                            <Link href={`/requests?sr=${r.service_request_id}`} className="text-brand-600 hover:underline">
                              보기
                            </Link>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {receivablesList.length > 0 && (
            <p className="text-xs text-gray-500 border-t border-gray-100 pt-3 mt-2">
              총 {receivablesList.length}건 · 미수금액 체크 및 결제는 <Link href="/payments/receivables" className="text-brand-600 hover:underline">미수금액 체크 및 결제</Link>에서 처리할 수 있습니다.
            </p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
