'use client';

import { useState, useMemo } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import DataTable from '@/components/ui/DataTable';
import { RefreshCw, AlertCircle, Download } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePaymentList } from '@/hooks/usePayments';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDate } from '@/utils/format';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import type { Payment } from '@/types/payment';
import type { StatusType } from '@/types/common';

const TYPE_LABELS: Record<string, string> = {
  property_unlock: '매물 열람',
  subscription: '구독',
  premium_feature: '프리미엄',
};

const METHOD_LABELS: Record<string, string> = {
  card: '카드',
  bank_transfer: '계좌이체',
  kakao_pay: '카카오페이',
  naver_pay: '네이버페이',
  toss_pay: '토스페이',
};

const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'completed', label: '완료' },
  { value: 'pending', label: '대기' },
  { value: 'failed', label: '실패' },
  { value: 'refunded', label: '환불' },
];

export default function AdminPaymentsPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({ page, limit: 20, search: debouncedSearch, status: (status || undefined) as StatusType | undefined }),
    [page, debouncedSearch, status]
  );
  const { data, isLoading, isError, error, refetch } = usePaymentList(params);

  const columns: ColumnDef<Payment>[] = useMemo(
    () => [
      {
        accessorKey: 'id',
        header: 'ID',
        cell: ({ getValue }) => (
          <span className="font-mono text-xs text-gray-500">{String(getValue()).slice(0, 10)}</span>
        ),
      },
      { accessorKey: 'userName', header: '결제자' },
      {
        accessorKey: 'type',
        header: '유형',
        cell: ({ getValue }) => TYPE_LABELS[String(getValue())] ?? String(getValue()),
      },
      {
        accessorKey: 'amount',
        header: '금액',
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">{formatCurrency(Number(getValue()))}</span>
        ),
      },
      {
        accessorKey: 'method',
        header: '수단',
        cell: ({ getValue }) => METHOD_LABELS[String(getValue())] ?? String(getValue()),
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ getValue }) => <StatusBadge status={String(getValue())} type="payment" />,
      },
      {
        accessorKey: 'createdAt',
        header: '결제일',
        cell: ({ getValue }) => formatDate(String(getValue())),
      },
    ],
    []
  );

  const tableData = data?.data ?? [];
  const meta = data?.meta;
  const exportCsv = () => {
    const BOM = '\uFEFF';
    const headers = ['ID', '결제자', '유형', '금액', '수단', '상태', '결제일'];
    const rows = tableData.map((p: Payment) => [
      String(p.id ?? '').slice(0, 10),
      p.userName ?? '',
      TYPE_LABELS[p.type as string] ?? p.type,
      String(p.amount ?? 0),
      METHOD_LABELS[p.method as string] ?? p.method,
      p.status ?? '',
      formatDate(String(p.createdAt ?? '')),
    ]);
    const csv = BOM + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `결제내역_${new Date().toISOString().slice(0, 10)}.csv`;
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
        <h1 className="text-2xl font-bold text-gray-900">결제 내역</h1>
        <div className="flex items-center gap-2">
          {/* CSV: 로딩과 무관하게 항상 클릭 가능 */}
          <Button variant="secondary" onClick={exportCsv} leftIcon={<Download className="h-4 w-4" />}>
            현재 목록 내보내기(CSV)
          </Button>
          {meta?.total != null && (
            <p className="text-sm text-gray-500">총 {meta.total.toLocaleString()}건</p>
          )}
        </div>
      </div>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="결제자/ID 검색"
              className="max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => { setStatus(f.value); setPage(1); }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    status === f.value
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          <DataTable<Payment>
            columns={columns}
            data={tableData}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            pageCount={meta?.totalPages}
            emptyMessage="결제 내역이 없습니다."
            onRetry={() => refetch()}
          />
        </CardBody>
      </Card>
    </div>
  );
}
