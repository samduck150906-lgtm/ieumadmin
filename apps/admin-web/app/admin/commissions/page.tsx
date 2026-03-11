'use client';

import { useState, useMemo } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import DataTable from '@/components/ui/DataTable';
import { RefreshCw, Download } from 'lucide-react';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCommissionList } from '@/hooks/useCommissions';
import { formatCurrency, formatDate } from '@/utils/format';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import type { Commission } from '@/types/commission';

const TYPE_LABELS: Record<string, string> = {
  referral: '추천 (5%)',
  contract: '전환완료',
  consultation: '상담요청',
  bonus: '보너스',
  recurring: '정기',
};

export default function AdminCommissionsPage() {
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({ page, limit: 20 }), [page]);
  const { data, isLoading, isError, error, refetch } = useCommissionList(params);

  const columns: ColumnDef<Commission>[] = useMemo(
    () => [
      { accessorKey: 'id', header: 'ID', cell: ({ getValue }) => String(getValue()).slice(0, 12) },
      { accessorKey: 'partnerName', header: '파트너' },
      { accessorKey: 'customerName', header: '고객' },
      {
        accessorKey: 'type',
        header: '유형',
        cell: ({ getValue }) => TYPE_LABELS[String(getValue())] ?? String(getValue()),
      },
      {
        accessorKey: 'amount',
        header: '금액',
        cell: ({ getValue }) => formatCurrency(Number(getValue())),
      },
      {
        accessorKey: 'rate',
        header: '율(%)',
        cell: ({ getValue }) => `${Number(getValue())}%`,
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ getValue }) => <StatusBadge status={String(getValue())} type="commission" />,
      },
      {
        accessorKey: 'createdAt',
        header: '일자',
        cell: ({ getValue }) => formatDate(String(getValue())),
      },
    ],
    []
  );

  const tableData = data?.data ?? [];
  const meta = data?.meta;
  const exportCsv = () => {
    const BOM = '\uFEFF';
    const headers = ['ID', '파트너', '고객', '유형', '금액', '율(%)', '상태', '일자'];
    const rows = tableData.map((c: Commission) => [
      String(c.id ?? '').slice(0, 12),
      c.partnerName ?? '',
      c.customerName ?? '',
      TYPE_LABELS[String(c.type)] ?? c.type,
      formatCurrency(Number(c.amount ?? 0)),
      String(c.rate ?? ''),
      c.status ?? '',
      formatDate(String(c.createdAt ?? '')),
    ]);
    const csv = BOM + [headers, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `수수료목록_${new Date().toISOString().slice(0, 10)}.csv`;
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
        <h1 className="text-2xl font-bold text-gray-900">수수료 관리</h1>
        {/* CSV: 로딩과 무관하게 항상 클릭 가능 */}
        <Button variant="secondary" onClick={exportCsv} leftIcon={<Download className="h-4 w-4" />}>
          현재 목록 내보내기(CSV)
        </Button>
      </div>
      {isError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <p className="text-sm text-red-800">{error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}</p>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
          </Button>
        </div>
      )}
      <Card>
        <CardBody>
          <DataTable<Commission>
            columns={columns}
            data={tableData}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            pageCount={meta?.totalPages}
            emptyMessage="수수료 내역이 없습니다."
            onRetry={() => refetch()}
          />
        </CardBody>
      </Card>
    </div>
  );
}
