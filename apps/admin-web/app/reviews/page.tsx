'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star, RefreshCw, ThumbsUp, Minus, ThumbsDown } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import BulkActionBar, { BulkHeaderCheckbox, BulkCheckboxCell } from '@/components/BulkActionBar';
import { useAuth } from '@/lib/auth';
import { SERVICE_CATEGORY_LABELS, RATING_LABELS } from '@/types/database';
import type { RatingType, ServiceCategory } from '@/types/database';
import { showError, showSuccess } from '@/lib/toast';

type ReviewRow = {
  id: string;
  rating: RatingType;
  comment: string | null;
  created_at: string;
  partner?: { id: string; business_name: string } | null;
  customer?: { id: string; name: string; phone: string } | null;
  service_request?: { id: string; category: ServiceCategory } | null;
};

const RATING_ICONS: Record<RatingType, { icon: typeof Star; color: string }> = {
  satisfied: { icon: ThumbsUp, color: 'text-green-600' },
  normal: { icon: Minus, color: 'text-yellow-600' },
  unsatisfied: { icon: ThumbsDown, color: 'text-red-600' },
};

function formatDate(d?: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ko-KR');
}

function formatPhone(phone?: string) {
  if (!phone) return '-';
  const c = phone.replace(/[^0-9]/g, '');
  if (c.length === 11) return `${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7)}`;
  return phone;
}

export default function ReviewsPage() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [ratingFilter, setRatingFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (ratingFilter) params.set('rating', ratingFilter);
      const res = await fetch(`/api/reviews?${params}`);
      const data = await res.json();
      setReviews(data.data || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch {
      showError('리뷰 목록을 불러오는데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  }, [page, ratingFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const allIds = reviews.map((r) => r.id);

  const handleBulkAction = useCallback(
    async (actionValue: string, ids: string[]) => {
      if (actionValue === 'export') {
        setExcelDownloading(true);
        try {
          const selected = reviews.filter((r) => ids.includes(r.id));
          const rows = selected.map((r) => {
            const customer = Array.isArray(r.customer) ? r.customer[0] : r.customer;
            const partner = Array.isArray(r.partner) ? r.partner[0] : r.partner;
            const sr = Array.isArray(r.service_request) ? r.service_request[0] : r.service_request;
            return [
              RATING_LABELS[r.rating] ?? r.rating,
              customer?.name ?? '-',
              formatPhone(customer?.phone),
              sr?.category ? SERVICE_CATEGORY_LABELS[sr.category] ?? sr.category : '-',
              partner?.business_name ?? '-',
              (r.comment ?? '').replace(/"/g, '""'),
              formatDate(r.created_at),
            ];
          });
          const header = ['평점', '고객', '연락처', '서비스', '업체', '의견', '날짜'];
          const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c)}"`).join(',')).join('\n');
          const bom = '\uFEFF';
          const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `리뷰목록_${new Date().toISOString().slice(0, 10)}.csv`;
          link.click();
          URL.revokeObjectURL(url);
          showSuccess('선택 항목을 다운로드했습니다.');
        } finally {
          setExcelDownloading(false);
        }
        return;
      }
      if (actionValue === 'delete') {
        if (!confirm(`선택한 ${ids.length}건의 리뷰를 삭제하시겠습니까? 삭제 후에는 복구할 수 없습니다.`)) return;
        setBulkDeleting(true);
        try {
          const res = await fetch('/api/reviews', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || '삭제 실패');
          showSuccess(`${ids.length}건 삭제되었습니다.`);
          setSelectedIds(new Set());
          loadData();
        } catch (e) {
          showError(e instanceof Error ? e.message : '일괄 삭제에 실패했습니다.');
        } finally {
          setBulkDeleting(false);
        }
      }
    },
    [reviews, loadData]
  );

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // 통계
  const stats = {
    total: reviews.length,
    satisfied: reviews.filter(r => r.rating === 'satisfied').length,
    normal: reviews.filter(r => r.rating === 'normal').length,
    unsatisfied: reviews.filter(r => r.rating === 'unsatisfied').length,
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Star className="h-6 w-6" /> 리뷰/평점 관리
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              총 {total}건 · 작업완료 시 고객에게 발송된 평가 결과
            </p>
          </div>
          <div className="flex gap-2">
            <select
              value={ratingFilter}
              onChange={e => { setRatingFilter(e.target.value); setPage(1); }}
              className="input py-1.5 text-sm w-28"
            >
              <option value="">전체</option>
              <option value="satisfied">만족</option>
              <option value="normal">보통</option>
              <option value="unsatisfied">불만</option>
            </select>
            <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card><CardBody className="text-center py-4">
            <p className="text-2xl font-bold">{total}</p>
            <p className="text-sm text-gray-500">전체</p>
          </CardBody></Card>
          <Card><CardBody className="text-center py-4">
            <p className="text-2xl font-bold text-green-600">{stats.satisfied}</p>
            <p className="text-sm text-gray-500">만족</p>
          </CardBody></Card>
          <Card><CardBody className="text-center py-4">
            <p className="text-2xl font-bold text-yellow-600">{stats.normal}</p>
            <p className="text-sm text-gray-500">보통</p>
          </CardBody></Card>
          <Card><CardBody className="text-center py-4">
            <p className="text-2xl font-bold text-red-600">{stats.unsatisfied}</p>
            <p className="text-sm text-gray-500">불만</p>
          </CardBody></Card>
        </div>

        {/* 일괄 작업 바 */}
        <BulkActionBar
          totalCount={reviews.length}
          selected={selectedIds}
          allIds={allIds}
          onSelectionChange={setSelectedIds}
          loading={loading}
          actions={[
            { label: '선택 항목 엑셀 다운로드', value: 'export' },
            { label: '일괄 삭제', value: 'delete', variant: 'danger' },
          ]}
          onAction={handleBulkAction}
          extra={
            excelDownloading || bulkDeleting ? (
              <span className="text-sm text-gray-500">{excelDownloading ? '다운로드 중...' : '삭제 중...'}</span>
            ) : null
          }
        />

        {/* 리뷰 목록 */}
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <BulkHeaderCheckbox
                    allIds={allIds}
                    selected={selectedIds}
                    onSelectionChange={setSelectedIds}
                    disabled={loading || reviews.length === 0}
                  />
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">평점</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">고객</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">연락처</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">서비스</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">업체</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">의견</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">날짜</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">불러오는 중...</td></tr>
                ) : reviews.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-12 text-center text-gray-400">리뷰가 없습니다.</td></tr>
                ) : (
                  reviews.map(r => {
                    const ratingConfig = RATING_ICONS[r.rating];
                    const Icon = ratingConfig?.icon || Star;
                    const colorClass = ratingConfig?.color || 'text-gray-600';
                    const customer = Array.isArray(r.customer) ? r.customer[0] : r.customer;
                    const partner = Array.isArray(r.partner) ? r.partner[0] : r.partner;
                    const sr = Array.isArray(r.service_request) ? r.service_request[0] : r.service_request;

                    return (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <BulkCheckboxCell
                          id={r.id}
                          selected={selectedIds}
                          onToggle={toggleSelection}
                          disabled={loading}
                        />
                        <td className="px-4 py-3">
                          <span className={`flex items-center gap-1 font-medium ${colorClass}`}>
                            <Icon className="h-4 w-4" />
                            {RATING_LABELS[r.rating] || r.rating}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">{customer?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm">{formatPhone(customer?.phone)}</td>
                        <td className="px-4 py-3 text-sm">
                          {sr?.category ? (
                            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                              {SERVICE_CATEGORY_LABELS[sr.category] || sr.category}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm">{partner?.business_name || '-'}</td>
                        <td className="px-4 py-3 text-sm max-w-[200px] truncate">{r.comment || '-'}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">{formatDate(r.created_at)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>&lsaquo;</Button>
            <span className="text-sm text-gray-600">{page} / {totalPages}</span>
            <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>&rsaquo;</Button>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
