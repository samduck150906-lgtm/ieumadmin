'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import DataTable from '@/components/ui/DataTable';
import Modal from '@/components/ui/Modal';
import { RefreshCw, AlertCircle, Download, Plus } from 'lucide-react';
import { usePropertyList } from '@/hooks/useProperties';
import { useDebounce } from '@/hooks/useDebounce';
import { propertyService } from '@/services/property.service';
import { showSuccess, showError } from '@/lib/toast';
import { formatCurrency, formatDate } from '@/utils/format';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import type { Property } from '@/types/property';

const TYPE_LABELS: Record<string, string> = {
  apartment: '아파트',
  villa: '빌라',
  officetel: '오피스텔',
  house: '주택',
  land: '토지',
  commercial: '상가',
};

const TYPE_FILTERS = [
  { value: '', label: '전체 유형' },
  { value: 'apartment', label: '아파트' },
  { value: 'villa', label: '빌라' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'house', label: '주택' },
  { value: 'land', label: '토지' },
  { value: 'commercial', label: '상가' },
];

const INIT_FORM = {
  complex_name: '',
  address_short: '',
  address_detail: '',
  price_display: '',
  area_sqm: '',
  property_type: 'apartment',
};

export default function AdminPropertiesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(1);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [form, setForm] = useState(INIT_FORM);
  const [saving, setSaving] = useState(false);
  const debouncedSearch = useDebounce(search, 300);

  const openRegisterModal = useCallback(() => {
    setForm(INIT_FORM);
    setShowRegisterModal(true);
  }, []);

  const handleRegister = useCallback(async () => {
    if (!form.address_short?.trim()) {
      showError('주소(간략)를 입력해주세요.');
      return;
    }
    setSaving(true);
    try {
      await propertyService.create({
        complex_name: form.complex_name?.trim() || null,
        address_short: form.address_short?.trim() || null,
        address_detail: form.address_detail?.trim() || null,
        price_display: form.price_display ? Number(form.price_display) : null,
        area_sqm: form.area_sqm ? Number(form.area_sqm) : null,
        property_type: form.property_type || null,
      });
      showSuccess('매물이 등록되었습니다.');
      setShowRegisterModal(false);
      queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch {
      // 에러 토스트는 API 인터셉터에서 처리
    } finally {
      setSaving(false);
    }
  }, [form, queryClient]);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      search: debouncedSearch || undefined,
      type: typeFilter || undefined,
    }),
    [page, debouncedSearch, typeFilter]
  );
  const { data, isLoading, isError, error, refetch } = usePropertyList(params);

  const columns: ColumnDef<Property>[] = useMemo(
    () => [
      {
        accessorKey: 'title',
        header: '제목',
        cell: ({ row }) => (
          <Link href={`/admin/properties/${row.original.id}`} className="font-medium text-brand-600 hover:underline">
            {row.original.title}
          </Link>
        ),
      },
      {
        accessorKey: 'type',
        header: '유형',
        cell: ({ getValue }) => (
          <span className="inline-flex rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            {TYPE_LABELS[String(getValue())] ?? String(getValue())}
          </span>
        ),
      },
      {
        accessorKey: 'price',
        header: '가격',
        cell: ({ getValue }) => (
          <span className="font-medium tabular-nums">{formatCurrency(Number(getValue()), true)}</span>
        ),
      },
      {
        accessorKey: 'address',
        header: '주소',
        cell: ({ getValue }) => {
          const addr = String(getValue());
          return (
            <span className="max-w-[200px] truncate block" title={addr}>
              {addr}
            </span>
          );
        },
      },
      {
        accessorKey: 'createdAt',
        header: '등록일',
        cell: ({ getValue }) => formatDate(String(getValue() ?? ''), 'dot'),
      },
    ],
    []
  );

  const tableData = data?.data ?? [];
  const meta = data?.meta;
  const exportCsv = () => {
    const BOM = '\uFEFF';
    const headers = ['제목', '유형', '가격', '주소', '등록일'];
    const rows = tableData.map((p: Property) => [
      p.title ?? '',
      TYPE_LABELS[String(p.type)] ?? p.type,
      formatCurrency(Number(p.price ?? 0), true),
      p.address ?? '',
      formatDate(String(p.createdAt ?? ''), 'dot'),
    ]);
    const csv = BOM + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `매물목록_${new Date().toISOString().slice(0, 10)}.csv`;
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
        <h1 className="text-2xl font-bold text-gray-900">매물 관리</h1>
        <div className="flex items-center gap-2">
          {meta?.total != null && (
            <p className="text-sm text-gray-500">총 {meta.total.toLocaleString()}건</p>
          )}
          <Button variant="secondary" onClick={exportCsv} leftIcon={<Download className="h-4 w-4" />}>
            현재 목록 내보내기(CSV)
          </Button>
          <Button leftIcon={<Plus className="h-4 w-4" />} onClick={openRegisterModal}>
            매물 등록
          </Button>
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
              placeholder="제목/주소 검색"
              className="max-w-xs"
            />
            <select
              value={typeFilter}
              onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {TYPE_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <DataTable<Property>
            columns={columns}
            data={tableData}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            pageCount={meta?.totalPages}
            emptyMessage="조건에 맞는 매물이 없습니다."
            onRetry={() => refetch()}
          />
        </CardBody>
      </Card>

      <Modal
        isOpen={showRegisterModal}
        onClose={() => setShowRegisterModal(false)}
        title="매물 등록"
        description="새 매물 정보를 입력하세요."
        size="lg"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowRegisterModal(false)} disabled={saving}>
              취소
            </Button>
            <Button onClick={handleRegister} disabled={saving}>
              {saving ? '등록 중...' : '등록'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">단지/건물명</label>
            <input
              type="text"
              value={form.complex_name}
              onChange={(e) => setForm((f) => ({ ...f, complex_name: e.target.value }))}
              placeholder="예: 힐스테이트"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">주소 (간략) *</label>
            <input
              type="text"
              value={form.address_short}
              onChange={(e) => setForm((f) => ({ ...f, address_short: e.target.value }))}
              placeholder="예: 서울 강남구 역삼동"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">상세주소</label>
            <input
              type="text"
              value={form.address_detail}
              onChange={(e) => setForm((f) => ({ ...f, address_detail: e.target.value }))}
              placeholder="예: 123-45"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">가격 (원)</label>
            <input
              type="number"
              value={form.price_display}
              onChange={(e) => setForm((f) => ({ ...f, price_display: e.target.value }))}
              placeholder="0"
              min={0}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">면적 (㎡)</label>
            <input
              type="number"
              value={form.area_sqm}
              onChange={(e) => setForm((f) => ({ ...f, area_sqm: e.target.value }))}
              placeholder="0"
              min={0}
              step={0.1}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">유형</label>
            <select
              value={form.property_type}
              onChange={(e) => setForm((f) => ({ ...f, property_type: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {TYPE_FILTERS.filter((f) => f.value).map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
        </div>
      </Modal>
    </div>
  );
}
