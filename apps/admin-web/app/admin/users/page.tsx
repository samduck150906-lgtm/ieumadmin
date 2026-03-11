'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import DataTable from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useUserList } from '@/hooks/useUsers';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatRelativeTime, formatPhone } from '@/utils/format';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import type { User } from '@/types/user';
import type { StatusType } from '@/types/common';
import { UserPlus, MoreHorizontal, Download } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  super_admin: '최고관리자',
  admin: '관리자',
  manager: '매니저',
  viewer: '뷰어',
};

const PROVIDER_LABELS: Record<string, string> = {
  kakao: '카카오',
  apple: '애플',
  email: '이메일',
};

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: 'active', label: '활성' },
  { value: 'inactive', label: '비활성' },
  { value: 'suspended', label: '정지' },
  { value: 'terminated', label: '해지' },
];

export default function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      search: debouncedSearch,
      status: (status || undefined) as StatusType | undefined,
    }),
    [page, debouncedSearch, status]
  );
  const { data, isLoading, refetch } = useUserList(params);

  const columns: ColumnDef<User>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: '이름',
        cell: ({ row }) => (
          <Link
            href={`/admin/users/${row.original.id}`}
            className="font-medium text-brand-600 hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        accessorKey: 'email',
        header: '이메일',
        cell: ({ getValue }) => String(getValue()),
      },
      {
        accessorKey: 'phone',
        header: '전화번호',
        cell: ({ getValue }) => formatPhone(String(getValue() ?? '')),
      },
      {
        accessorKey: 'role',
        header: '역할',
        cell: ({ getValue }) => ROLE_LABELS[String(getValue())] ?? String(getValue()),
      },
      {
        accessorKey: 'provider',
        header: '가입경로',
        cell: ({ getValue }) => PROVIDER_LABELS[String(getValue())] ?? String(getValue()),
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ getValue }) => <StatusBadge status={String(getValue())} type="user" />,
      },
      {
        accessorKey: 'createdAt',
        header: '가입일',
        cell: ({ getValue }) => formatDate(String(getValue() ?? '')),
      },
      {
        accessorKey: 'lastLoginAt',
        header: '최근접속',
        cell: ({ getValue }) => formatRelativeTime(String(getValue() ?? '')),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <Link
            href={`/admin/users/${row.original.id}`}
            className="p-1 rounded hover:bg-gray-100"
            aria-label="상세"
          >
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
    const headers = ['이름', '이메일', '전화번호', '역할', '가입경로', '상태', '가입일', '최근접속'];
    const rows = tableData.map((u: User) => [
      u.name ?? '',
      u.email ?? '',
      u.phone ?? '',
      ROLE_LABELS[u.role] ?? u.role,
      PROVIDER_LABELS[u.provider] ?? u.provider,
      u.status ?? '',
      formatDate(u.createdAt ?? ''),
      formatRelativeTime(u.lastLoginAt ?? ''),
    ]);
    const csv = BOM + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `회원목록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const pagination = meta
    ? { pageIndex: meta.page - 1, pageSize: meta.limit }
    : { pageIndex: 0, pageSize: 20 };
  const onPaginationChange = (updaterOrValue: Updater<PaginationState>) => {
    const next = typeof updaterOrValue === 'function' ? updaterOrValue(pagination) : updaterOrValue;
    setPage(next.pageIndex + 1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">회원 관리</h1>
        <div className="flex gap-2">
          {/* CSV: 로딩과 무관하게 항상 클릭 가능 */}
          <Button variant="secondary" onClick={exportCsv} leftIcon={<Download className="h-4 w-4" />}>
            현재 목록 내보내기(CSV)
          </Button>
          <Link href="/admin/users/new">
            <Button leftIcon={<UserPlus className="h-4 w-4" />}>회원 등록</Button>
          </Link>
        </div>
      </div>
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="이름/이메일/전화번호 검색"
              className="max-w-xs"
            />
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <DataTable<User>
            columns={columns}
            data={tableData}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            pageCount={meta?.totalPages}
            emptyMessage="검색 조건에 맞는 회원이 없습니다."
            onRetry={() => refetch()}
          />
        </CardBody>
      </Card>
    </div>
  );
}
