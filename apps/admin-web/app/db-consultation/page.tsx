'use client';

import { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Search, Plus, X, RefreshCw, Phone, Mail, FileText, CheckSquare, Square, History } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/lib/auth';
import {
  getDbConsultations,
  createDbConsultation,
  updateDbConsultation,
  deleteDbConsultation,
  getDbConsultationStats,
  getDbConsultationStatusHistory,
  type DbConsultation,
  type DbConsultationStatusHistoryEntry,
} from '@/lib/api/db-consultations';
import { SERVICE_CATEGORY_LABELS } from '@/types/database';
import { showError, showSuccess } from '@/lib/toast';
import { getErrorMessage } from '@/lib/logger';
import { withTimeout, DATA_FETCH_TIMEOUT_MS } from '@/lib/timeout';

const STATUS_OPTIONS = [
  { value: '', label: '상태 전체' },
  { value: 'pending', label: '대기' },
  { value: 'in_progress', label: '상담중' },
  { value: 'completed', label: '완료' },
  { value: 'cancelled', label: '취소' },
];

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  in_progress: '상담중',
  completed: '완료',
  cancelled: '취소',
};

const STATUS_VARIANTS: Record<string, 'yellow' | 'blue' | 'green' | 'gray'> = {
  pending: 'yellow',
  in_progress: 'blue',
  completed: 'green',
  cancelled: 'gray',
};

const INQUIRY_TYPE_LABELS: Record<string, string> = {
  purchase: 'DB 구매',
  view: 'DB 열람',
  pricing: '가격 문의',
  other: '기타',
};

export default function DbConsultationPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<DbConsultation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [stats, setStats] = useState({ total: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 });

  // 등록 모달
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    partner_name: '',
    contact_phone: '',
    category: '',
    inquiry_type: 'purchase',
    content: '',
    admin_memo: '',
  });
  const [creating, setCreating] = useState(false);

  // 상세/수정 모달
  const [detailItem, setDetailItem] = useState<DbConsultation | null>(null);
  const [statusHistory, setStatusHistory] = useState<DbConsultationStatusHistoryEntry[]>([]);
  const [editMemo, setEditMemo] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [saving, setSaving] = useState(false);

  // 일괄 상태변경
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [result, statsData] = await Promise.all([
        getDbConsultations({
          search: searchTerm || undefined,
          status: statusFilter || undefined,
          category: categoryFilter || undefined,
          date_from: dateFrom || undefined,
          date_to: dateTo || undefined,
          page,
          limit: 20,
        }),
        getDbConsultationStats(),
      ]);
      setItems(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setStats(statsData);
    } catch (err) {
      const msg = getErrorMessage(err);
      setLoadError(msg);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, categoryFilter, dateFrom, dateTo, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [page, statusFilter, searchTerm, categoryFilter, dateFrom, dateTo]);

  const handleCreate = async () => {
    if (!createForm.partner_name.trim()) {
      showError('업체명을 입력해주세요.');
      return;
    }
    setCreating(true);
    try {
      await createDbConsultation({
        ...createForm,
        handled_by: user?.id,
      });
      showSuccess('상담 건이 등록되었습니다.');
      setShowCreateModal(false);
      setCreateForm({ partner_name: '', contact_phone: '', category: '', inquiry_type: 'purchase', content: '', admin_memo: '' });
      loadData();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = async () => {
    if (!detailItem) return;
    setSaving(true);
    try {
      await updateDbConsultation(detailItem.id, {
        status: editStatus as DbConsultation['status'],
        admin_memo: editMemo,
        handled_by: user?.id ?? null,
      });
      showSuccess('상담 내용이 수정되었습니다.');
      const history = await getDbConsultationStatusHistory(detailItem.id);
      setStatusHistory(history);
      setDetailItem((prev) => (prev ? { ...prev, status: editStatus as DbConsultation['status'], admin_memo: editMemo, updated_at: new Date().toISOString() } : null));
      loadData();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 상담 건을 삭제하시겠습니까?')) return;
    try {
      await deleteDbConsultation(id);
      showSuccess('삭제되었습니다.');
      setDetailItem(null);
      loadData();
    } catch (err) {
      showError(getErrorMessage(err));
    }
  };

  const openDetail = useCallback(async (item: DbConsultation) => {
    setDetailItem(item);
    setEditMemo(item.admin_memo || '');
    setEditStatus(item.status);
    setStatusHistory([]);
    try {
      const history = await getDbConsultationStatusHistory(item.id);
      setStatusHistory(history);
    } catch {
      setStatusHistory([]);
      showError('상태 이력을 불러오지 못했습니다.');
    }
  }, []);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((i) => i.id)));
    }
  };

  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0 || !bulkStatus) {
      showError('선택 항목과 변경할 상태를 선택해주세요.');
      return;
    }
    const statusLabel = STATUS_LABELS[bulkStatus] || bulkStatus;
    if (!confirm(`선택한 ${selectedIds.size}건의 상태를 '${statusLabel}'으로 변경하시겠습니까?`)) return;
    setBulkUpdating(true);
    try {
      const ids = Array.from(selectedIds);
      const results = await Promise.allSettled(
        ids.map((id) => updateDbConsultation(id, { status: bulkStatus as DbConsultation['status'], handled_by: user?.id ?? null }))
      );
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.length - successCount;
      showSuccess(`일괄 상태변경 완료: ${successCount}건${failCount > 0 ? `, 실패 ${failCount}건` : ''}`);
      setSelectedIds(new Set());
      setBulkStatus('');
      loadData();
    } catch (err) {
      showError(getErrorMessage(err));
    } finally {
      setBulkUpdating(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">DB 구매 상담</h1>
            <p className="mt-1 text-sm text-gray-500">
              제휴업체의 DB 구매·열람 문의 및 상담 이력을 관리합니다.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="secondary" size="sm" onClick={loadData}>
              <RefreshCw className="w-4 h-4 mr-1" />
              새로고침
            </Button>
            <Button variant="primary" size="sm" onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-1" />
              상담 등록
            </Button>
          </div>
        </div>

        {/* 안내 카드 */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-4 h-4 text-blue-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">DB 구매(열람) 안내</h2>
            </div>
            <p className="text-xs text-gray-600">
              제휴업체는 <strong>DB 관리</strong> 메뉴에서 배정 DB를, <strong>DB 구매</strong> 메뉴에서 미배정 DB를 열람 비용 결제 후 확인할 수 있습니다.
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-green-100 rounded-lg">
                <MessageSquare className="w-4 h-4 text-green-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">상담 채널</h2>
            </div>
            <ul className="space-y-1 text-xs text-gray-600">
              <li className="flex items-center gap-2">
                <Phone className="w-3 h-3 text-gray-400" />
                고객센터 전화 문의
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-3 h-3 text-gray-400" />
                이메일 상담 접수
              </li>
            </ul>
          </div>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {[
            { label: '전체', value: stats.total, color: 'text-gray-900' },
            { label: '대기', value: stats.pending, color: 'text-yellow-600' },
            { label: '상담중', value: stats.in_progress, color: 'text-blue-600' },
            { label: '완료', value: stats.completed, color: 'text-green-600' },
            { label: '취소', value: stats.cancelled, color: 'text-gray-500' },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

        {/* 필터: 날짜, 업체(검색), 상태, 카테고리 */}
        <Card>
          <div className="px-6 py-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs text-gray-500 font-medium">등록일</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="input w-36 text-sm"
              />
              <span className="text-gray-400">~</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="input w-36 text-sm"
              />
            </div>
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="업체명, 연락처, 내용 검색"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setPage(1); }}
                className="input pl-10 w-full"
              />
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
              className="input w-36"
              title="카테고리"
            >
              <option value="">카테고리 전체</option>
              {Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="input w-32"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </Card>

        {/* 목록 */}
        <Card>
          {loadError ? (
            <div className="px-6 py-12 text-center">
              <p className="text-red-600 mb-3">{loadError}</p>
              <Button variant="secondary" size="sm" onClick={loadData}>재시도</Button>
            </div>
          ) : loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
              <p className="text-sm text-gray-400 mt-2">불러오는 중...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <MessageSquare className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm">등록된 상담 건이 없습니다.</p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => setShowCreateModal(true)}
                type="button"
                style={{ pointerEvents: 'auto', position: 'relative', zIndex: 1 }}
              >
                <Plus className="w-4 h-4 mr-1" />
                첫 상담 등록
              </Button>
            </div>
          ) : (
            <>
              {/* 일괄 상태변경 바: 1) 행 선택 → 2) 상태 선택 → 3) 적용 */}
              <div className="flex flex-wrap items-center gap-4 px-6 py-3 border-b border-gray-200 bg-gray-50/80">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
                    aria-label={selectedIds.size === items.length ? '전체 해제' : `전체 선택 (${items.length}건)`}
                  >
                    {selectedIds.size === items.length && items.length > 0 ? (
                      <CheckSquare className="w-4.5 h-4.5 text-primary-600" />
                    ) : selectedIds.size > 0 ? (
                      <CheckSquare className="w-4.5 h-4.5 text-primary-400" />
                    ) : (
                      <Square className="w-4.5 h-4.5 text-gray-400" />
                    )}
                    <span className="font-medium text-gray-700">
                      {selectedIds.size > 0 ? `${selectedIds.size}건 선택됨` : '행 선택'}
                    </span>
                  </button>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="text-gray-400">→</span>
                      <label className="flex items-center gap-1.5 text-sm">
                        <span className="text-gray-600">변경할 상태:</span>
                        <select
                          value={bulkStatus}
                          onChange={(e) => setBulkStatus(e.target.value)}
                          className="input w-32 text-sm py-1.5"
                          aria-label="일괄 변경할 상태"
                        >
                          <option value="">선택</option>
                          {STATUS_OPTIONS.filter((o) => o.value).map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </label>
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={handleBulkStatusChange}
                        disabled={!bulkStatus || bulkUpdating}
                      >
                        {bulkUpdating ? '처리 중...' : `선택한 ${selectedIds.size}건에 적용`}
                      </Button>
                    </>
                  )}
                </div>
                {selectedIds.size === 0 && (
                  <p className="text-xs text-gray-500">목록에서 체크 후 변경할 상태를 선택하고 적용 버튼을 누르세요.</p>
                )}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-3 py-3 w-10">
                        <button
                          type="button"
                          onClick={toggleSelectAll}
                          className="p-0.5 rounded hover:bg-gray-100"
                          aria-label={selectedIds.size === items.length ? '전체 해제' : '전체 선택'}
                        >
                          {selectedIds.size === items.length && items.length > 0 ? (
                            <CheckSquare className="w-4 h-4 text-primary-600" />
                          ) : (
                            <Square className="w-4 h-4 text-gray-400" />
                          )}
                        </button>
                      </th>
                      <th className="px-6 py-3 font-medium">업체명</th>
                      <th className="px-4 py-3 font-medium">연락처</th>
                      <th className="px-4 py-3 font-medium">카테고리</th>
                      <th className="px-4 py-3 font-medium">문의유형</th>
                      <th className="px-4 py-3 font-medium">상태</th>
                      <th className="px-4 py-3 font-medium">등록일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr
                        key={item.id}
                        onClick={() => openDetail(item)}
                        className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${selectedIds.has(item.id) ? 'bg-primary-50/50' : ''}`}
                      >
                        <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => toggleSelect(item.id)}
                            className="p-0.5 rounded hover:bg-gray-200"
                            aria-label={selectedIds.has(item.id) ? '선택 해제' : '선택'}
                          >
                            {selectedIds.has(item.id) ? (
                              <CheckSquare className="w-4 h-4 text-primary-600" />
                            ) : (
                              <Square className="w-4 h-4 text-gray-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-6 py-3 font-medium text-gray-900">{item.partner_name}</td>
                        <td className="px-4 py-3 text-gray-600">{item.contact_phone || '-'}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {item.category ? (SERVICE_CATEGORY_LABELS[item.category] || item.category) : '-'}
                        </td>
                        <td className="px-4 py-3 text-gray-600">
                          {INQUIRY_TYPE_LABELS[item.inquiry_type] || item.inquiry_type}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            label={STATUS_LABELS[item.status] || item.status}
                            variant={STATUS_VARIANTS[item.status] || 'gray'}
                          />
                        </td>
                        <td className="px-4 py-3 text-gray-500 text-xs">
                          {new Date(item.created_at).toLocaleDateString('ko-KR')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="px-6 py-4 flex items-center justify-between border-t border-gray-200">
                  <p className="text-xs text-gray-500">총 {total}건</p>
                  <div className="flex gap-1">
                    <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>이전</Button>
                    <span className="px-3 py-1.5 text-sm text-gray-600">{page} / {totalPages}</span>
                    <Button variant="secondary" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>다음</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* 등록 모달 */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 modal-bottom-sheet" onClick={() => setShowCreateModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">상담 등록</h2>
              <button type="button" onClick={() => setShowCreateModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">업체명 *</label>
                <input
                  type="text"
                  value={createForm.partner_name}
                  onChange={(e) => setCreateForm({ ...createForm, partner_name: e.target.value })}
                  className="input w-full"
                  placeholder="제휴업체명"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">연락처</label>
                <input
                  type="text"
                  value={createForm.contact_phone}
                  onChange={(e) => setCreateForm({ ...createForm, contact_phone: e.target.value })}
                  className="input w-full"
                  placeholder="010-0000-0000"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">카테고리</label>
                  <select
                    value={createForm.category}
                    onChange={(e) => setCreateForm({ ...createForm, category: e.target.value })}
                    className="input w-full"
                  >
                    <option value="">선택</option>
                    {Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">문의유형</label>
                  <select
                    value={createForm.inquiry_type}
                    onChange={(e) => setCreateForm({ ...createForm, inquiry_type: e.target.value })}
                    className="input w-full"
                  >
                    {Object.entries(INQUIRY_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">문의 내용</label>
                <textarea
                  value={createForm.content}
                  onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                  className="input w-full h-24 resize-none"
                  placeholder="상담 문의 내용을 입력하세요"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">관리자 메모</label>
                <textarea
                  value={createForm.admin_memo}
                  onChange={(e) => setCreateForm({ ...createForm, admin_memo: e.target.value })}
                  className="input w-full h-20 resize-none"
                  placeholder="내부 메모"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
              <Button variant="secondary" size="sm" onClick={() => setShowCreateModal(false)}>취소</Button>
              <Button variant="primary" size="sm" onClick={handleCreate} isLoading={creating}>등록</Button>
            </div>
          </div>
        </div>
      )}

      {/* 상세/수정 모달 */}
      {detailItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 modal-bottom-sheet" onClick={() => setDetailItem(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-bold text-gray-900">상담 상세</h2>
              <button type="button" onClick={() => setDetailItem(null)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">업체명</p>
                  <p className="font-medium text-gray-900">{detailItem.partner_name}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">연락처</p>
                  <p className="text-gray-900">{detailItem.contact_phone || '-'}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">카테고리</p>
                  <p className="text-gray-900">
                    {detailItem.category ? (SERVICE_CATEGORY_LABELS[detailItem.category] || detailItem.category) : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">문의유형</p>
                  <p className="text-gray-900">{INQUIRY_TYPE_LABELS[detailItem.inquiry_type] || detailItem.inquiry_type}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">등록일</p>
                  <p className="text-gray-900">{new Date(detailItem.created_at).toLocaleString('ko-KR')}</p>
                </div>
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">수정일</p>
                  <p className="text-gray-900">{new Date(detailItem.updated_at).toLocaleString('ko-KR')}</p>
                </div>
              </div>

              {/* 상태 변경 이력 (누가 언제 변경했는지 — 분쟁 대비) */}
              <div>
                <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 mb-2">
                  <History className="w-4 h-4 text-gray-500" />
                  상태 변경 이력
                </h3>
                {statusHistory.length === 0 ? (
                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3">변경 이력이 없습니다.</p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto">
                    {statusHistory.map((h) => (
                      <li key={h.id} className="text-xs bg-gray-50 rounded-lg p-2.5 border border-gray-100">
                        <span className="text-gray-600">
                          {STATUS_LABELS[h.from_status ?? ''] ?? h.from_status ?? '—'} → <strong>{STATUS_LABELS[h.to_status] ?? h.to_status}</strong>
                        </span>
                        <span className="block mt-0.5 text-gray-500">
                          {new Date(h.changed_at).toLocaleString('ko-KR')}
                          {h.changed_by && (
                            <span className="ml-1.5">· 변경자 ID: <code className="text-gray-600">{h.changed_by.slice(0, 8)}…</code></span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {detailItem.content && (
                <div>
                  <p className="text-gray-500 text-xs mb-1">문의 내용</p>
                  <p className="text-sm text-gray-900 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">{detailItem.content}</p>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="input w-full"
                >
                  <option value="pending">대기</option>
                  <option value="in_progress">상담중</option>
                  <option value="completed">완료</option>
                  <option value="cancelled">취소</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">관리자 메모</label>
                <textarea
                  value={editMemo}
                  onChange={(e) => setEditMemo(e.target.value)}
                  className="input w-full h-24 resize-none"
                  placeholder="내부 메모"
                />
              </div>
            </div>
            <div className="flex justify-between px-6 py-4 border-t border-gray-200">
              <Button variant="danger" size="sm" onClick={() => handleDelete(detailItem.id)}>삭제</Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setDetailItem(null)}>닫기</Button>
                <Button variant="primary" size="sm" onClick={handleUpdate} isLoading={saving}>저장</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
