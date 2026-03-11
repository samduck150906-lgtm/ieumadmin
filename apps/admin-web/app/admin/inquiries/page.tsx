'use client';

import { useState, useMemo } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import DataTable from '@/components/ui/DataTable';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useInquiryList, useInquiryReply } from '@/hooks/useInquiries';
import { useDebounce } from '@/hooks/useDebounce';
import { formatDate, formatPhone } from '@/utils/format';
import type { ColumnDef, PaginationState, Updater } from '@tanstack/react-table';
import type { Inquiry } from '@/services/inquiry.service';
import { MessageSquare, MoreHorizontal } from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: 'pending', label: '대기' },
  { value: 'in_progress', label: '상담중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

export default function AdminInquiriesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const params = useMemo(
    () => ({
      page,
      limit: 20,
      search: debouncedSearch || undefined,
      status: status || undefined,
    }),
    [page, debouncedSearch, status]
  );
  const { data, isLoading, refetch } = useInquiryList(params);
  const replyMutation = useInquiryReply();

  const [replyModal, setReplyModal] = useState<{ item: Inquiry } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyStatus, setReplyStatus] = useState('');

  const openReplyModal = (item: Inquiry) => {
    setReplyModal({ item });
    setReplyText(item.admin_memo ?? '');
    setReplyStatus(item.status);
  };

  const closeReplyModal = () => {
    setReplyModal(null);
    setReplyText('');
    setReplyStatus('');
  };

  const handleSubmitReply = async () => {
    if (!replyModal) return;
    await replyMutation.mutateAsync({
      id: replyModal.item.id,
      admin_memo: replyText,
      status: replyStatus !== replyModal.item.status ? replyStatus : undefined,
    });
    closeReplyModal();
  };

  const columns: ColumnDef<Inquiry>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: '이름',
        cell: ({ getValue }) => (
          <span className="font-medium text-gray-900">{String(getValue() ?? '')}</span>
        ),
      },
      {
        accessorKey: 'email',
        header: '이메일',
        cell: ({ getValue }) => String(getValue() ?? '-'),
      },
      {
        accessorKey: 'phone',
        header: '연락처',
        cell: ({ getValue }) => formatPhone(String(getValue() ?? '')),
      },
      {
        accessorKey: 'subject',
        header: '제목',
        cell: ({ getValue }) => {
          const text = String(getValue() ?? '');
          return (
            <span className="max-w-[150px] truncate block" title={text}>
              {text || '-'}
            </span>
          );
        },
      },
      {
        accessorKey: 'content',
        header: '문의 내용',
        cell: ({ getValue }) => {
          const text = String(getValue() ?? '');
          return (
            <span className="max-w-[200px] truncate block" title={text}>
              {text || '-'}
            </span>
          );
        },
      },
      {
        accessorKey: 'status',
        header: '상태',
        cell: ({ getValue }) => <StatusBadge status={String(getValue())} />,
      },
      {
        accessorKey: 'created_at',
        header: '등록일',
        cell: ({ getValue }) => formatDate(String(getValue() ?? '')),
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                openReplyModal(row.original);
              }}
              leftIcon={<MessageSquare className="h-4 w-4" />}
            >
              답변 등록
            </Button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openReplyModal(row.original);
              }}
              className="p-1 rounded hover:bg-gray-100"
              aria-label="상세"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </div>
        ),
      },
    ],
    []
  );

  const tableData = data?.data ?? [];
  const meta = data?.meta;
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
        <h1 className="text-2xl font-bold text-gray-900">문의 관리</h1>
      </div>
      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="이름/이메일/연락처/제목/내용 검색"
              className="max-w-xs"
            />
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <DataTable<Inquiry>
            columns={columns}
            data={tableData}
            isLoading={isLoading}
            pagination={pagination}
            onPaginationChange={onPaginationChange}
            pageCount={meta?.totalPages}
            emptyMessage="검색 조건에 맞는 문의가 없습니다."
            onRetry={() => refetch()}
          />
        </CardBody>
      </Card>

      {/* 답변 등록 모달 */}
      {replyModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-bottom-sheet"
          onClick={closeReplyModal}
        >
          <div
            className="mx-4 w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-4 text-lg font-semibold text-gray-900">답변 등록</h2>
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-sm font-medium text-gray-600">이름</p>
                <p className="text-gray-900">{replyModal.item.name}</p>
              </div>
              {replyModal.item.subject && (
                <div>
                  <p className="mb-1 text-sm font-medium text-gray-600">제목</p>
                  <p className="text-gray-900">{replyModal.item.subject}</p>
                </div>
              )}
              <div>
                <p className="mb-1 text-sm font-medium text-gray-600">문의 내용</p>
                <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-700">
                  {replyModal.item.content || '-'}
                </p>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">답변 (관리자 메모)</label>
                <textarea
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                  placeholder="답변 내용을 입력하세요"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">상태</label>
                <select
                  value={replyStatus}
                  onChange={(e) => setReplyStatus(e.target.value)}
                  className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20"
                >
                  {STATUS_OPTIONS.filter((o) => o.value).map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="secondary" onClick={closeReplyModal}>
                취소
              </Button>
              <Button
                onClick={handleSubmitReply}
                disabled={replyMutation.isPending}
                leftIcon={<MessageSquare className="h-4 w-4" />}
              >
                {replyMutation.isPending ? '저장 중...' : '답변 저장'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
