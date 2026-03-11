'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Users, BarChart3, Download, UserPlus, Shuffle, X } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import BulkActionBar from '@/components/BulkActionBar';
import { bulkAssignPartners, updateServiceRequestStatus } from '@/lib/api/requests';
import { getPartnersByCategory } from '@/lib/api/partners';
import { useAuth } from '@/lib/auth';
import { getErrorMessage, logger } from '@/lib/logger';
import { withTimeout, DATA_FETCH_TIMEOUT_MS, getTimeoutFriendlyMessage } from '@/lib/timeout';
import { showError, showSuccess } from '@/lib/toast';
import { SERVICE_CATEGORY_LABELS, AREA_SIZE_LABELS, MOVING_TYPE_LABELS } from '@/types/database';
import type { ServiceCategory, AreaSize, MovingType } from '@/types/database';
import type { HqStatus } from '@/types/database';

const SOURCE_LABELS: Record<string, string> = {
  landing: '랜딩',
  qr: 'QR',
  direct: '직접',
};

const CATEGORY_VARIANTS: Record<string, 'blue' | 'green' | 'purple' | 'orange' | 'yellow' | 'gray'> = {
  moving: 'blue',
  cleaning: 'green',
  internet_tv: 'purple',
  interior: 'orange',
  appliance_rental: 'purple',
  kiosk: 'yellow',
};

const HQ_STATUS_OPTIONS: { value: HqStatus; label: string }[] = [
  { value: 'unread', label: '미배정' },
  { value: 'read', label: '열람' },
  { value: 'assigned', label: '배정완료' },
  { value: 'settlement_check', label: '정산확인' },
  { value: 'settlement_done', label: '정산완료' },
  { value: 'hq_review_needed', label: '본사확인필요' },
  { value: 'cancelled', label: '취소' },
];

/** 선택된 고객(현재 페이지)에 속한 서비스 요청 ID 목록 */
function getRequestIdsFromSelectedCustomers(customers: any[], selectedCustomerIds: Set<string>): string[] {
  return customers
    .filter((c: any) => selectedCustomerIds.has(c.id))
    .flatMap((c: any) => (c.service_requests || []).map((r: any) => r.id));
}

export default function CustomersPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [sourceFilter, setSourceFilter] = useState<string>('');
  const [stats, setStats] = useState<{ total: number; bySource: Record<string, number>; byCategory: Record<string, number> } | null>(null);
  const [statsLoadError, setStatsLoadError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [showBulkStatusModal, setShowBulkStatusModal] = useState(false);
  const [bulkAssignCategory, setBulkAssignCategory] = useState('');
  const [bulkAssignPartnerId, setBulkAssignPartnerId] = useState('');
  const [bulkAssignPartnersList, setBulkAssignPartnersList] = useState<{ id: string; business_name: string; manager_name?: string; manager_phone?: string }[]>([]);
  const [bulkAssigning, setBulkAssigning] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<HqStatus | ''>('');
  const [bulkStatusApplying, setBulkStatusApplying] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setStatsLoadError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        ...(searchTerm && { search: searchTerm }),
        ...(categoryFilter && { category: categoryFilter }),
        ...(sourceFilter && { source_type: sourceFilter }),
      });
      const res = await withTimeout(
        fetch(`/api/admin/customers?${params}`, { credentials: 'include' }).then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body?.error ?? '데이터를 불러오지 못했습니다.');
          }
          return r.json();
        }),
        DATA_FETCH_TIMEOUT_MS
      );
      setCustomers(res.data || []);
      setTotal(res.total);
      setTotalPages(res.totalPages);
      setStats(res.stats ?? null);
      setStatsLoadError(res.statsError ?? null);
    } catch (err) {
      logger.error('고객 목록 로드 오류', err);
      const friendly = getTimeoutFriendlyMessage(err) || getErrorMessage(err);
      setLoadError(err instanceof Error ? friendly : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, page, categoryFilter, sourceFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const t = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(t);
  }, [searchTerm, categoryFilter, sourceFilter]);

  // 일괄 배정 모달: 카테고리 선택 시 해당 업체 목록 로드
  useEffect(() => {
    if (!showBulkAssignModal || !bulkAssignCategory) {
      setBulkAssignPartnersList([]);
      setBulkAssignPartnerId('');
      return;
    }
    getPartnersByCategory(bulkAssignCategory as ServiceCategory)
      .then((data) => setBulkAssignPartnersList((data ?? []) as { id: string; business_name: string; manager_name?: string; manager_phone?: string }[]))
      .catch(() => {
        setBulkAssignPartnersList([]);
        showError('업체 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
      });
    setBulkAssignPartnerId('');
  }, [showBulkAssignModal, bulkAssignCategory]);

  const formatDate = (v: string | null) =>
    v ? new Date(v).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-';

  const allIds = customers.map((c: any) => c.id);

  const handleExportSelected = async () => {
    if (selectedIds.size === 0) return;
    setExcelDownloading(true);
    try {
      const selected = customers.filter((c: any) => selectedIds.has(c.id));
      const rows = selected.map((c: any) => [
        c.name ?? '-',
        c.phone ?? '-',
        c.current_address ?? '-',
        c.moving_address ?? '-',
        AREA_SIZE_LABELS[c.area_size as AreaSize] ?? c.area_size ?? '-',
        MOVING_TYPE_LABELS[c.moving_type as MovingType] ?? c.moving_type ?? '-',
        c.moving_date ? formatDate(c.moving_date) : '-',
        (c.service_requests || []).map((r: any) => SERVICE_CATEGORY_LABELS[r.category as ServiceCategory] ?? r.category).join(', ') || '-',
        formatDate(c.created_at),
      ]);
      const header = ['고객명', '연락처', '현재주소', '이사주소', '평수', '이사형태', '이사일', '신청서비스', '등록일'];
      const csv = [header, ...rows].map(r => r.map((c: string) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n');
      const bom = '\uFEFF';
      const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `고객목록_${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      showError('다운로드 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setExcelDownloading(false);
    }
  };

  const requestIdsFromSelection = getRequestIdsFromSelectedCustomers(customers, selectedIds);

  const openBulkAssignModal = () => {
    if (requestIdsFromSelection.length === 0) {
      showError('선택한 고객에 해당하는 신청 건이 없습니다.');
      return;
    }
    const categories = new Set<string>();
    customers
      .filter((c: any) => selectedIds.has(c.id))
      .forEach((c: any) => (c.service_requests || []).forEach((r: any) => categories.add(r.category)));
    setBulkAssignCategory(categories.size === 1 ? Array.from(categories)[0] : '');
    setBulkAssignPartnerId('');
    setShowBulkAssignModal(true);
  };

  const handleBulkAssignRandom = async () => {
    if (requestIdsFromSelection.length === 0 || !user) return;
    if (!confirm(`선택한 고객의 신청 ${requestIdsFromSelection.length}건을 랜덤 배정하시겠습니까?`)) return;
    setBulkAssigning(true);
    try {
      const results = await bulkAssignPartners(requestIdsFromSelection, user.id, 'random');
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;
      showSuccess(`배정 완료: 성공 ${successCount}건${failCount > 0 ? `, 실패 ${failCount}건` : ''}`);
      setSelectedIds(new Set());
      setShowBulkAssignModal(false);
      loadData();
    } catch (e) {
      showError('일괄 배정 실패: ' + getErrorMessage(e));
    } finally {
      setBulkAssigning(false);
    }
  };

  const handleBulkAssignSpecific = async () => {
    if (requestIdsFromSelection.length === 0 || !bulkAssignPartnerId || !user) return;
    const partnerName = bulkAssignPartnersList.find((p) => p.id === bulkAssignPartnerId)?.business_name ?? '';
    if (!confirm(`선택한 신청 ${requestIdsFromSelection.length}건을 '${partnerName}' 업체에 배정하시겠습니까?`)) return;
    setBulkAssigning(true);
    try {
      const results = await bulkAssignPartners(requestIdsFromSelection, user.id, 'specific', bulkAssignPartnerId);
      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;
      showSuccess(`배정 완료: 성공 ${successCount}건${failCount > 0 ? `, 실패 ${failCount}건` : ''}`);
      setSelectedIds(new Set());
      setShowBulkAssignModal(false);
      loadData();
    } catch (e) {
      showError('일괄 배정 실패: ' + getErrorMessage(e));
    } finally {
      setBulkAssigning(false);
    }
  };

  const openBulkStatusModal = () => {
    if (requestIdsFromSelection.length === 0) {
      showError('선택한 고객에 해당하는 신청 건이 없습니다.');
      return;
    }
    setBulkStatusValue('');
    setShowBulkStatusModal(true);
  };

  const handleBulkStatusApply = async () => {
    if (requestIdsFromSelection.length === 0 || !bulkStatusValue) return;
    const label = HQ_STATUS_OPTIONS.find((o) => o.value === bulkStatusValue)?.label ?? bulkStatusValue;
    if (!confirm(`선택한 신청 ${requestIdsFromSelection.length}건의 상태를 '${label}'으로 변경하시겠습니까?`)) return;
    setBulkStatusApplying(true);
    try {
      await Promise.all(requestIdsFromSelection.map((id) => updateServiceRequestStatus(id, bulkStatusValue as HqStatus)));
      showSuccess(`${requestIdsFromSelection.length}건 상태 변경 완료`);
      setSelectedIds(new Set());
      setBulkStatusValue('');
      setShowBulkStatusModal(false);
      loadData();
    } catch (e) {
      showError('일괄 상태 변경 실패: ' + getErrorMessage(e));
    } finally {
      setBulkStatusApplying(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">리드관리 · 고객 통계</h1>
            <p className="mt-1 text-sm text-gray-500">고객 정보 게시 및 통계 (P25~)</p>
          </div>
          <Link
            href="/lead-stats"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            리드통계(가망고객 DB) →
          </Link>
        </div>

        {/* 로드 실패 시 에러 UI */}
        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-red-800">{loadError}</p>
            <Button variant="secondary" size="sm" onClick={() => loadData()}>
              <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
            </Button>
          </div>
        )}

        {/* 통계 로드 실패 시 경고 (목록은 로드됨) */}
        {statsLoadError && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center justify-between gap-4">
            <p className="text-sm text-amber-800">{statsLoadError}</p>
            <Button variant="secondary" size="sm" onClick={() => loadData()}>
              <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
            </Button>
          </div>
        )}

        {/* 고객 통계 카드 */}
        {stats != null && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardBody className="flex flex-row items-center gap-3">
                <div className="p-3 bg-primary-100 rounded-lg">
                  <Users className="h-6 w-6 text-primary-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">전체 고객</p>
                  <p className="text-xl font-bold text-gray-900">{stats.total}명</p>
                </div>
              </CardBody>
            </Card>
            <Card>
              <CardBody className="flex flex-row items-center gap-3 min-w-0">
                <div className="p-3 bg-blue-100 rounded-lg flex-shrink-0">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-500">유입처별</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                    {Object.entries(stats.bySource).length > 0
                      ? Object.entries(stats.bySource).map(([k, v]) => (
                          <span key={k} className="text-sm font-medium text-gray-700 whitespace-nowrap">
                            {SOURCE_LABELS[k] ?? k} <span className="text-gray-900">{v}</span>
                          </span>
                        ))
                      : <span className="text-sm text-gray-500">-</span>}
                  </div>
                </div>
              </CardBody>
            </Card>
            <Card className="sm:col-span-2">
              <CardBody>
                <p className="text-sm text-gray-500 mb-2">서비스별 신청 건수</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {Object.entries(stats.byCategory).map(([cat, count]) => (
                    <span key={cat} className="text-sm font-medium text-gray-700 whitespace-nowrap">
                      {SERVICE_CATEGORY_LABELS[cat] ?? cat}:{' '}
                      <span className="text-gray-900">{count}건</span>
                    </span>
                  ))}
                  {Object.keys(stats.byCategory).length === 0 && <span className="text-sm text-gray-500">-</span>}
                </div>
              </CardBody>
            </Card>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="고객명, 연락처로 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input pl-10 w-full"
            />
          </div>
          <select
            className="input w-40"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          >
            <option value="">서비스 전체</option>
            {Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            className="input w-32"
            value={sourceFilter}
            onChange={(e) => { setSourceFilter(e.target.value); setPage(1); }}
          >
            <option value="">유입처 전체</option>
            {Object.entries(SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <Button variant="secondary" type="button" onClick={() => loadData()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            새로고침
          </Button>
        </div>

        {/* 일괄 작업 바 */}
        {customers.length > 0 && (
          <BulkActionBar
            totalCount={allIds.length}
            selected={selectedIds}
            allIds={allIds}
            onSelectionChange={setSelectedIds}
            loading={excelDownloading}
            actions={[
              { label: '선택 항목 엑셀 다운로드', value: 'export', variant: 'default' },
              { label: '일괄 배정', value: 'assign', variant: 'default' },
              { label: '상태 변경', value: 'status', variant: 'default' },
            ]}
            onAction={(value) => {
              if (value === 'export') handleExportSelected();
              if (value === 'assign') openBulkAssignModal();
              if (value === 'status') openBulkStatusModal();
            }}
          />
        )}

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">로딩 중...</div>
          ) : customers.length === 0 ? (
            <div className="p-12 text-center text-gray-500">등록된 고객이 없습니다.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={allIds.length > 0 && selectedIds.size === allIds.length}
                        onChange={() => setSelectedIds(selectedIds.size === allIds.length ? new Set() : new Set(allIds))}
                        className="rounded border-gray-300 text-primary-600"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">고객명</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">연락처</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">현재주소</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이사주소</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">평수</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이사형태</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이사일</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청서비스</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">유입처</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">등록일</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {customers.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(c.id)}
                          onChange={() => {
                            const next = new Set(selectedIds);
                            next.has(c.id) ? next.delete(c.id) : next.add(c.id);
                            setSelectedIds(next);
                          }}
                          className="rounded border-gray-300 text-primary-600"
                        />
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">{c.name ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-900">{c.phone ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate" title={c.current_address ?? ''}>{c.current_address ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[180px] truncate" title={c.moving_address ?? ''}>{c.moving_address ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{AREA_SIZE_LABELS[c.area_size as AreaSize] ?? c.area_size ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{MOVING_TYPE_LABELS[c.moving_type as MovingType] ?? c.moving_type ?? '-'}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{formatDate(c.moving_date)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(c.service_requests || []).map((r: any) => (
                            <StatusBadge
                              key={r.id}
                              label={SERVICE_CATEGORY_LABELS[r.category as ServiceCategory] ?? r.category}
                              variant={CATEGORY_VARIANTS[r.category] ?? 'gray'}
                            />
                          ))}
                          {(!c.service_requests || c.service_requests.length === 0) && '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {SOURCE_LABELS[c.source_type] ?? c.source_type ?? '-'}
                        {c.source_realtor?.business_name && (
                          <span className="block text-xs text-gray-500">{c.source_realtor.business_name}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600">
                {total}명 중 {(page - 1) * 20 + 1}–{Math.min(page * 20, total)}명
              </p>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="flex items-center px-3 text-sm text-gray-600">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* 일괄 배정 모달 */}
      {showBulkAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-xl">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">일괄 배정</h2>
              <button type="button" onClick={() => setShowBulkAssignModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                선택한 고객의 신청 <strong>{requestIdsFromSelection.length}건</strong>을 배정합니다.
              </p>
              <Button
                variant="secondary"
                onClick={handleBulkAssignRandom}
                disabled={bulkAssigning}
                className="w-full mb-4"
              >
                <Shuffle className="h-4 w-4 mr-2" />
                랜덤 배정
              </Button>
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">특정 업체로 배정</p>
                <label className="block text-sm text-gray-600 mb-1">카테고리</label>
                <select
                  value={bulkAssignCategory}
                  onChange={(e) => setBulkAssignCategory(e.target.value)}
                  className="input w-full mb-3"
                >
                  <option value="">선택</option>
                  {Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
                {bulkAssignCategory && (
                  <>
                    <label className="block text-sm text-gray-600 mb-1">제휴업체</label>
                    {bulkAssignPartnersList.length === 0 ? (
                      <p className="text-gray-400 text-sm py-2">해당 카테고리 업체가 없습니다.</p>
                    ) : (
                      <select
                        value={bulkAssignPartnerId}
                        onChange={(e) => setBulkAssignPartnerId(e.target.value)}
                        className="input w-full mb-3"
                      >
                        <option value="">선택</option>
                        {bulkAssignPartnersList.map((p) => (
                          <option key={p.id} value={p.id}>{p.business_name}</option>
                        ))}
                      </select>
                    )}
                  </>
                )}
                <Button
                  variant="primary"
                  onClick={handleBulkAssignSpecific}
                  disabled={bulkAssigning || !bulkAssignPartnerId}
                  className="w-full"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  {bulkAssigning ? '배정 중...' : '선택 업체에 배정'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 상태 변경 모달 */}
      {showBulkStatusModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">일괄 상태 변경</h2>
              <button type="button" onClick={() => setShowBulkStatusModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-600 mb-4">
                선택한 고객의 신청 <strong>{requestIdsFromSelection.length}건</strong>의 본사 상태를 변경합니다.
              </p>
              <label className="block text-sm font-medium text-gray-700 mb-2">변경할 상태</label>
              <select
                value={bulkStatusValue}
                onChange={(e) => setBulkStatusValue((e.target.value || '') as HqStatus | '')}
                className="input w-full mb-4"
              >
                <option value="">선택</option>
                {HQ_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setShowBulkStatusModal(false)} className="flex-1">
                  취소
                </Button>
                <Button
                  variant="primary"
                  onClick={handleBulkStatusApply}
                  disabled={!bulkStatusValue || bulkStatusApplying}
                  className="flex-1"
                >
                  {bulkStatusApplying ? '적용 중...' : '적용'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
