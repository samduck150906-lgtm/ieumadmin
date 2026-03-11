'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import DataTable from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePartnerList } from '@/hooks/usePartners';
import { useDebounce } from '@/hooks/useDebounce';
import { formatCurrency, formatDate, formatBusinessNumber } from '@/utils/format';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import type { Partner } from '@/types/partner';
import type { StatusType } from '@/types/common';
import { Building2, MoreHorizontal, RefreshCw, AlertCircle, Download } from 'lucide-react';

const TIER_LABELS: Record<string, string> = {
  bronze: '🥉 브론즈',
  silver: '🥈 실버',
  gold: '🥇 골드',
  platinum: '플래티넘',
  diamond: '다이아몬드',
};

export default function AdminPartnersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({ page, limit: 20, search: debouncedSearch, status: (status || undefined) as StatusType | undefined }),
    [page, debouncedSearch, status]
  );
  const { data, isLoading, isError, error, refetch } = usePartnerList(params);

  const columns: ColumnDef<Partner>[] = useMemo(
    () => [
      {
        accessorKey: 'companyName',
        header: '업체명',
        cell: ({ row }) => (
          <Link
            href={`/admin/partners/${row.original.id}`}
            className="font-medium text-brand-600 hover:underline"
          >
            {row.original.companyName}
          </Link>
        ),
      },
      { accessorKey: 'representativeName', header: '대표자' },
      {
        accessorKey: 'businessNumber',
        header: '사업자번호',
        cell: ({ getValue }) => formatBusinessNumber(String(getValue() ?? '')),
      },
      {
        accessorKey: 'tier',
        header: '등급',
        cell: ({ getValue }) => TIER_LABELS[String(getValue())] ?? String(getValue()),
      },
      {
        accessorKey: 'customerCount',
        header: '고객수',
        cell: ({ getValue }) => <span className="tabular-nums">{Number(getValue())}명</span>,
      },
      {
        accessorKey: 'totalSettlement',
        header: '총정산액',
        cell: ({ getValue }) => <span className="tabular-nums font-medium">{formatCurrency(Number(getValue()), true)}</span>,
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ getValue }) => <StatusBadge status={String(getValue())} type="partner" />,
      },
      {
        accessorKey: 'joinedAt',
        header: '가입일',
        cell: ({ getValue }) => formatDate(String(getValue() ?? ''), 'dot'),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link href={`/admin/partners/${row.original.id}`} className="p-1 rounded hover:bg-gray-100" aria-label="상세">
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
    const headers = ['업체명', '대표자', '사업자번호', '등급', '고객수', '총정산액', '상태', '가입일'];
    const rows = tableData.map((p: Partner) => [
      p.companyName ?? '',
      p.representativeName ?? '',
      formatBusinessNumber(String(p.businessNumber ?? '')),
      TIER_LABELS[p.tier as string] ?? p.tier,
      String(p.customerCount ?? 0),
      formatCurrency(Number(p.totalSettlement ?? 0), true),
      p.status ?? '',
      formatDate(String(p.joinedAt ?? ''), 'dot'),
    ]);
    const csv = BOM + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `파트너목록_${new Date().toISOString().slice(0, 10)}.csv`;
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
        <h1 className="text-2xl font-bold text-gray-900">파트너 관리</h1>
        <div className="flex gap-2">
          {/* CSV: 로딩과 무관하게 항상 클릭 가능 */}
          <Button variant="secondary" onClick={exportCsv} leftIcon={<Download className="h-4 w-4" />}>
            현재 목록 내보내기(CSV)
          </Button>
          <Link href="/admin/partners/new">
            <Button>파트너 등록</Button>
          </Link>
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
          <div className="flex flex-col gap-4 sm:flex-row">
            <SearchInput value={search} onChange={setSearch} placeholder="업체명/대표자 검색" className="max-w-xs" />
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">전체 상태</option>
              <option value="pending_verification">인증대기</option>
              <option value="active">활성</option>
              <option value="suspended">정지</option>
              <option value="terminated">해지</option>
            </select>
          </div>
          <DataTable<Partner>
            columns={columns}
            data={tableData}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            pageCount={meta?.totalPages}
            emptyMessage="조건에 맞는 파트너가 없습니다."
            onRetry={() => refetch()}
          />
        </CardBody>
      </Card>
    </div>
  );
}
