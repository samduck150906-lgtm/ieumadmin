'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  UserPlus,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Building2,
  Phone,
  Mail,
  Home,
  FileText,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { useAuth } from '@/lib/auth';
import { useAuthHeaders } from '@/lib/auth-headers';
import { logger, getErrorMessage } from '@/lib/logger';
import { showError, showSuccess } from '@/lib/toast';

type AppType = 'realtor' | 'partner';

const STATUS_LABELS: Record<string, string> = {
  pending: '대기',
  approved: '승인',
  rejected: '반려',
};

/** 협력업체 신청 카테고리: 공인중개사 / 이사 / 청소 / 인터넷 / 인테리어 / 기타 */
const PARTNER_CATEGORY_LABELS: Record<string, string> = {
  realtor: '공인중개사',
  moving: '이사',
  cleaning: '청소',
  internet: '인터넷',
  interior: '인테리어',
  etc: '기타',
};

export default function PartnerApplicationsPage() {
  const { user } = useAuth();
  const authHeaders = useAuthHeaders();
  const [activeTab, setActiveTab] = useState<AppType>('realtor');
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('pending');
  const [rejectModal, setRejectModal] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);
  const [openingDocPath, setOpeningDocPath] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  /** documents 버킷 path → signed URL 발급 후 새 창으로 열기 (staff 전용) */
  const openDocumentUrl = async (path: string) => {
    if (!path || path.includes('..')) return;
    setOpeningDocPath(path);
    try {
      const res = await fetch(
        `/api/documents/signed-url?path=${encodeURIComponent(path)}`,
        { headers: authHeaders }
      );
      if (!res.ok) throw new Error('URL 발급 실패');
      const data = await res.json();
      if (data?.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else {
        showError('사업자등록증 URL을 가져오지 못했습니다.');
      }
    } catch {
      showError('사업자등록증 보기에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setOpeningDocPath(null);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      params.set('category', activeTab); // 서버 사이드 필터 (realtor | partner)
      params.set('page', String(page));
      params.set('limit', '20');
      const res = await fetch(`/api/partner-applications?${params.toString()}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || '목록을 불러오지 못했습니다.');
      }
      setList(result.data || []);
      setTotal(result.total ?? 0);
      setTotalPages(result.totalPages ?? 1);
    } catch (error) {
      logger.error('신청 목록 로드 오류', error);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, activeTab, authHeaders]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 탭 전환 시 페이지 리셋
  useEffect(() => {
    setPage(1);
  }, [activeTab]);

  const handleApprove = async (id: string, businessName: string) => {
    if (!user?.id) return;
    const label = activeTab === 'realtor' ? '공인중개사' : '제휴업체';
    if (!confirm(`승인 시 ${label} 계정이 생성됩니다. 계속할까요?`)) return;
    setProcessing(true);
    try {
      const res = await fetch('/api/partner-applications/approve', {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({ id, reviewedBy: user.id }),
      });
      const data = await res.json();
      if (data.success) {
        showSuccess(data.message || '승인 처리되었습니다.');
        loadData();
      } else {
        showError(data.error || '승인 처리에 실패했습니다.');
      }
    } catch {
      showError('승인 요청 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!user?.id || selectedIds.size === 0) return;
    const label = activeTab === 'realtor' ? '공인중개사' : '제휴업체';
    if (!confirm(`선택한 ${selectedIds.size}건을 일괄 승인하시겠습니까? ${label} 계정이 생성됩니다.`)) return;
    setProcessing(true);
    let success = 0;
    let fail = 0;
    for (const id of selectedIds) {
      try {
        const res = await fetch('/api/partner-applications/approve', {
          method: 'POST',
          headers: authHeaders,
          credentials: 'include',
          body: JSON.stringify({ id, reviewedBy: user.id }),
        });
        const data = await res.json();
        if (data.success) success++;
        else fail++;
      } catch {
        fail++;
      }
    }
    showSuccess(`일괄 승인 완료: 성공 ${success}건${fail > 0 ? `, 실패 ${fail}건` : ''}`);
    setSelectedIds(new Set());
    setProcessing(false);
    loadData();
  };

  const handleReject = async () => {
    if (!rejectModal || !user?.id || !rejectReason.trim()) {
      showError('반려 사유를 입력해주세요.');
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch('/api/partner-applications/reject', {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          id: rejectModal.id,
          reviewedBy: user.id,
          reason: rejectReason.trim(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        showSuccess(data.message ?? '반려 처리되었습니다.');
        setRejectModal(null);
        setRejectReason('');
        loadData();
      } else {
        showError(data.error ?? '반려 처리에 실패했습니다.');
      }
    } catch (e) {
      logger.error(getErrorMessage(e));
      showError('반려 처리 중 오류가 발생했습니다.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">가입 신청 관리</h1>
            <p className="mt-1 text-sm text-gray-500">
              홈페이지를 통해 접수된 공인중개사 및 제휴업체 가입 신청
            </p>
          </div>
          <button
            onClick={() => loadData()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 p-1 bg-gray-100 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('realtor')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'realtor'
                ? 'bg-white text-blue-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Home className="w-4 h-4" />
            공인중개사 신청
          </button>
          <button
            onClick={() => setActiveTab('partner')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'partner'
                ? 'bg-white text-green-700 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Building2 className="w-4 h-4" />
            제휴업체 신청
          </button>
        </div>

        {/* 안내 배너 */}
        {activeTab === 'realtor' && (
          <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800">
            <UserPlus className="w-5 h-5 mt-0.5 flex-shrink-0 text-blue-500" />
            <div>
              <span className="font-semibold">공인중개사 신청</span>은 승인 시{' '}
              <span className="font-semibold">공인중개사(realtor) 계정</span>이 활성화됩니다.
              랜딩페이지 자가 가입건은 이미 계정이 생성된 상태이며, 승인 클릭 시 SMS 안내만 발송됩니다.
              미가입 신청건은 임시 비밀번호가 자동 발송됩니다.
            </div>
          </div>
        )}
        {activeTab === 'partner' && (
          <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl text-sm text-green-800">
            <Building2 className="w-5 h-5 mt-0.5 flex-shrink-0 text-green-500" />
            <div>
              <span className="font-semibold">제휴업체 신청</span>은 승인 시{' '}
              <span className="font-semibold">제휴업체(partner) 계정</span>이 활성화됩니다.
              랜딩페이지 자가 가입건은 이미 계정이 생성된 상태이며, 승인 클릭 시 SMS 안내만 발송됩니다.
              미가입 신청건은 임시 비밀번호가 자동 발송됩니다.
            </div>
          </div>
        )}

        {/* 상태 필터 */}
        <div className="flex gap-4 items-center">
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">전체</option>
            <option value="pending">대기</option>
            <option value="approved">승인</option>
            <option value="rejected">반려</option>
          </select>
          <span className="text-sm text-gray-500">총 {total}건</span>
        </div>

        {/* 일괄 작업 바 */}
        {list.length > 0 && statusFilter === 'pending' && (
          <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm">
            <button
              type="button"
              onClick={() => {
                const pendingIds = list.filter((r: any) => r.status === 'pending').map((r: any) => r.id);
                setSelectedIds(selectedIds.size === pendingIds.length ? new Set() : new Set(pendingIds));
              }}
              className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
            >
              <input
                type="checkbox"
                checked={list.filter((r: any) => r.status === 'pending').length > 0 && selectedIds.size === list.filter((r: any) => r.status === 'pending').length}
                readOnly
                className="rounded border-gray-300 text-primary-600"
              />
              대기건 전체 선택 ({list.filter((r: any) => r.status === 'pending').length}건)
            </button>
            {selectedIds.size > 0 && (
              <>
                <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold px-2.5 py-1">
                  {selectedIds.size}건 선택됨
                </span>
                <div className="h-4 w-px bg-gray-200 mx-1" />
                <button
                  type="button"
                  onClick={handleBulkApprove}
                  disabled={processing}
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  일괄 승인
                </button>
              </>
            )}
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-500">로딩 중...</div>
          ) : list.length === 0 ? (
            <div className="p-12 text-center">
              <UserPlus className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">
                {statusFilter === 'pending' ? '대기 중인 신청이 없습니다.' : '신청 내역이 없습니다.'}
              </p>
              <p className="text-sm text-gray-400 mt-1">
                홈페이지의{' '}
                {activeTab === 'realtor'
                  ? '공인중개사 신청(/realtor/apply)'
                  : '제휴업체 신청(/partner/apply)'}{' '}
                페이지에서 신청하면 여기에 표시됩니다.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={list.filter((r: any) => r.status === 'pending').length > 0 && selectedIds.size === list.filter((r: any) => r.status === 'pending').length}
                        onChange={() => {
                          const pendingIds = list.filter((r: any) => r.status === 'pending').map((r: any) => r.id);
                          setSelectedIds(selectedIds.size === pendingIds.length ? new Set() : new Set(pendingIds));
                        }}
                        className="rounded border-gray-300 text-primary-600"
                      />
                    </th>
                    {activeTab === 'partner' && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">업종</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                      {activeTab === 'realtor' ? '사무소명' : '업체명'}
                    </th>
                    {activeTab === 'partner' && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사업자번호</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">담당자</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">연락처</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                    {activeTab === 'partner' && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">사업자등록증</th>
                    )}
                    {activeTab === 'realtor' && (
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">활동지역</th>
                    )}
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">신청일</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {list.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 w-10">
                        {row.status === 'pending' && (
                          <input
                            type="checkbox"
                            checked={selectedIds.has(row.id)}
                            onChange={() => {
                              const next = new Set(selectedIds);
                              next.has(row.id) ? next.delete(row.id) : next.add(row.id);
                              setSelectedIds(next);
                            }}
                            className="rounded border-gray-300 text-primary-600"
                          />
                        )}
                      </td>
                      {activeTab === 'partner' && (
                        <td className="px-4 py-3 text-sm">
                          <div className="flex flex-wrap gap-1">
                            {(['realtor', 'moving', 'cleaning', 'internet', 'interior', 'etc'] as const).map(
                              (cat) =>
                                row[`service_${cat}`] ? (
                                  <span
                                    key={cat}
                                    className="inline-flex px-1.5 py-0.5 text-xs bg-gray-100 text-gray-700 rounded"
                                  >
                                    {PARTNER_CATEGORY_LABELS[cat]}
                                  </span>
                                ) : null
                            )}
                          </div>
                        </td>
                      )}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {activeTab === 'realtor' ? (
                            <Home className="w-4 h-4 text-blue-400" />
                          ) : (
                            <Building2 className="w-4 h-4 text-green-400" />
                          )}
                          <span className="font-medium text-gray-900">{row.business_name}</span>
                        </div>
                        {row.address && (
                          <div className="text-xs text-gray-500 mt-0.5">{row.address}</div>
                        )}
                      </td>
                      {activeTab === 'partner' && (
                        <td className="px-4 py-3 text-sm text-gray-600 font-mono">
                          {row.business_number || '-'}
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm font-medium text-gray-900">{row.manager_name}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" />
                          {row.manager_phone}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {row.email ? (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3.5 h-3.5" />
                            {row.email}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      {activeTab === 'partner' && (
                        <td className="px-4 py-3 text-sm">
                          {row.business_license_url ? (
                            <button
                              type="button"
                              onClick={() => openDocumentUrl(row.business_license_url)}
                              disabled={openingDocPath === row.business_license_url}
                              className="inline-flex items-center gap-1 text-primary-600 hover:underline disabled:opacity-50"
                            >
                              <FileText className="w-4 h-4" />
                              {openingDocPath === row.business_license_url ? '열기 중…' : '보기'}
                            </button>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      )}
                      {activeTab === 'realtor' && (
                        <td className="px-4 py-3 text-sm text-gray-600">{row.address || '-'}</td>
                      )}
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                            row.status === 'approved'
                              ? 'bg-green-100 text-green-800'
                              : row.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}
                        >
                          {STATUS_LABELS[row.status] || row.status}
                        </span>
                        {row.reject_reason && (
                          <div className="text-xs text-gray-500 mt-1">사유: {row.reject_reason}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {row.created_at ? new Date(row.created_at).toLocaleDateString('ko-KR') : '-'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {row.status === 'pending' && (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleApprove(row.id, row.business_name)}
                              disabled={processing}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              <Check className="w-4 h-4" />
                              승인
                            </button>
                            <button
                              onClick={() => setRejectModal({ id: row.id, name: row.business_name })}
                              disabled={processing}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              <X className="w-4 h-4" />
                              반려
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200">
              <span className="text-sm text-gray-500">
                {total}건 중 {(page - 1) * 20 + 1}–{Math.min(page * 20, total)}건
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <span className="flex items-center px-3 text-sm">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 반려 사유 모달 */}
      {rejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-bold text-gray-900">반려 사유 입력</h3>
            <p className="text-sm text-gray-500 mt-1">{rejectModal.name}</p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="반려 사유를 입력해주세요."
              className="mt-4 w-full border border-gray-300 rounded-lg px-3 py-2 min-h-[100px]"
              rows={4}
            />
            <div className="mt-6 flex gap-2 justify-end">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                취소
              </button>
              <button
                onClick={handleReject}
                disabled={!rejectReason.trim() || processing}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                반려 처리
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
