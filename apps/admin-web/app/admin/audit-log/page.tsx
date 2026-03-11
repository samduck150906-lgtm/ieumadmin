'use client';

import { useState, useMemo } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import SearchInput from '@/components/ui/SearchInput';
import DataTable from '@/components/ui/DataTable';
import { useAuditLogList } from '@/hooks/useAuditLogs';
import { useDebounce } from '@/hooks/useDebounce';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import type { AuditLog } from '@/types/audit-log';
import { Download, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const ACTOR_LABELS: Record<string, string> = {
  staff: '관리자',
  partner: '파트너',
  realtor: '공인중개사',
  system: '시스템',
};

const ACTION_LABELS: Record<string, string> = {
  'withdrawal.approved': '출금 승인',
  'withdrawal.completed': '출금 완료',
  'withdrawal.rejected': '출금 반려',
  'realtor_upload_docs': '서류 업로드',
  'partner_db_view_pay': 'DB 열람 결제',
};

function formatDateTime(date: string | null | undefined): string {
  if (!date) return '-';
  return new Date(date).toLocaleString('ko-KR');
}

function getIpFromDetails(details: Record<string, unknown> | null): string {
  if (!details) return '-';
  const ip = details.ip ?? details.ip_address ?? details.ipAddress;
  return typeof ip === 'string' ? ip : '-';
}

function getActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export default function AdminAuditLogPage() {
  const [search, setSearch] = useState('');
  const [actorType, setActorType] = useState<string>('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      action: debouncedSearch || undefined,
      actor_type: actorType || undefined,
    }),
    [page, debouncedSearch, actorType]
  );
  const { data, isLoading, isError, error, refetch } = useAuditLogList(params);

  const columns: ColumnDef<AuditLog>[] = useMemo(
    () => [
      {
        accessorKey: 'createdAt',
        header: '일시',
        cell: ({ getValue }) => (
          <span className="tabular-nums whitespace-nowrap">{formatDateTime(String(getValue() ?? ''))}</span>
        ),
      },
      {
        accessorKey: 'actorType',
        header: '사용자',
        cell: ({ row }) => {
          const type = row.original.actorType;
          const id = row.original.actorId;
          const label = ACTOR_LABELS[type] ?? type;
          return (
            <span>
              {label}
              {id && <span className="text-gray-500 ml-1">({id.slice(0, 8)}…)</span>}
            </span>
          );
        },
      },
      {
        accessorKey: 'action',
        header: '작업 내용',
        cell: ({ getValue }) => (
          <span className="font-medium">{getActionLabel(String(getValue() ?? ''))}</span>
        ),
      },
      {
        accessorKey: 'resourceType',
        header: '대상 유형',
        cell: ({ getValue }) => (
          <span className="text-gray-600">{String(getValue() ?? '-')}</span>
        ),
      },
      {
        id: 'ip',
        header: 'IP',
        cell: ({ row }) => (
          <span className="tabular-nums text-gray-500 font-mono text-xs">
            {getIpFromDetails(row.original.details)}
          </span>
        ),
      },
    ],
    []
  );

  const tableData = data?.data ?? [];
  const meta = data?.meta;

  const exportCsv = () => {
    const BOM = '\uFEFF';
    const headers = ['일시', '사용자', '작업 내용', '대상 유형', 'IP'];
    const rows = tableData.map((log: AuditLog) => [
      formatDateTime(log.createdAt),
      `${ACTOR_LABELS[log.actorType] ?? log.actorType}${log.actorId ? ` (${log.actorId})` : ''}`,
      getActionLabel(log.action),
      log.resourceType ?? '-',
      getIpFromDetails(log.details),
    ]);
    const csv =
      BOM +
      [headers, ...rows]
        .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
        .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `감사로그_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pagination = meta
    ? { pageIndex: meta.page - 1, pageSize: meta.limit }
    : { pageIndex: 0, pageSize: 20 };
  const onPaginationChange = (updaterOrValue: Updater<PaginationState>) => {
    const next =
      typeof updaterOrValue === 'function' ? updaterOrValue(pagination) : updaterOrValue;
    setPage(next.pageIndex + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">감사 로그</h1>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            onClick={exportCsv}
            leftIcon={<Download className="h-4 w-4" />}
          >
            현재 목록 내보내기(CSV)
          </Button>
        </div>
      </div>
      {isError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-sm text-red-800">
              {error instanceof Error ? error.message : '데이터를 불러오지 못했습니다.'}
            </p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
          </Button>
        </div>
      )}
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="작업(action) 검색"
              className="max-w-xs"
            />
            <select
              value={actorType}
              onChange={(e) => {
                setActorType(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              <option value="">전체 사용자 유형</option>
              <option value="staff">관리자</option>
              <option value="partner">파트너</option>
              <option value="realtor">공인중개사</option>
              <option value="system">시스템</option>
            </select>
          </div>
          <DataTable<AuditLog>
            columns={columns}
            data={tableData}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            pageCount={meta?.totalPages}
            emptyMessage="조건에 맞는 감사 로그가 없습니다."
            onRetry={() => refetch()}
          />
        </CardBody>
      </Card>
    </div>
  );
}
