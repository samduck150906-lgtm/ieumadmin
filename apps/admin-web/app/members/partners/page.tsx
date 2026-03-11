'use client';

import { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  UserPlus,
  Eye,
  Star,
  Phone,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  Download,
} from 'lucide-react';
import Link from 'next/link';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useMemberPartnerList } from '@/hooks/useMemberPartnerList';
import { memberPartnerService } from '@/services/member-partner.service';
import { useAuth } from '@/lib/auth';
import { useAuthHeaders } from '@/lib/auth-headers';
import { createPaymentRequest } from '@/lib/api/payments';
import { exportPartners } from '@/lib/excel';
import { getErrorMessage, logger } from '@/lib/logger';
import { showSuccess, showError } from '@/lib/toast';
import { withTimeout, EXCEL_FETCH_TIMEOUT_MS, getTimeoutFriendlyMessage } from '@/lib/timeout';
import { SERVICE_CATEGORY_LABELS, ServiceCategory } from '@/types/database';
import type { MemberPartnerListSort } from '@/types/member-partner';

const categoryOptions = Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => ({
  value,
  label,
}));

export default function PartnersPage() {
  const { user } = useAuth();
  const authHeaders = useAuthHeaders();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState<MemberPartnerListSort>('created_at');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<'active' | 'inactive' | ''>('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const [excelDownloading, setExcelDownloading] = useState(false);

  const {
    data: partnersData,
    isLoading: loading,
    error: loadError,
    refetch,
  } = useMemberPartnerList({
    search: searchTerm || undefined,
    category: (categoryFilter as ServiceCategory) || undefined,
    status: statusFilter || undefined,
    page,
    limit: 20,
    sort: sortBy,
  });

  const partners = partnersData?.data ?? [];
  const total = partnersData?.total ?? 0;
  const totalPages = partnersData?.totalPages ?? 1;

  const [showAddModal, setShowAddModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [paymentModal, setPaymentModal] = useState<{ partnerId: string; partnerName: string } | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMemo, setPaymentMemo] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [newPartner, setNewPartner] = useState({
    email: '',
    password: '',
    business_name: '',
    manager_name: '',
    manager_phone: '',
    service_categories: [] as string[],
  });

  // 검색 디바운스
  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const loadErrorMsg = (() => {
    if (!loadError) return null;
    const friendly = getTimeoutFriendlyMessage(loadError) || getErrorMessage(loadError);
    return friendly.includes('Supabase') || friendly.includes('설정되지 않았습니다')
      ? 'Supabase 환경변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY)를 확인해 주세요.'
      : friendly;
  })();

  const handleExcelDownload = async () => {
    if (excelDownloading) return;
    setExcelDownloading(true);
    try {
      const result = await withTimeout(
        memberPartnerService.getList({
          search: searchTerm || undefined,
          category: (categoryFilter as ServiceCategory) || undefined,
          status: statusFilter || undefined,
          page: 1,
          limit: 9999,
          sort: sortBy,
        }),
        EXCEL_FETCH_TIMEOUT_MS
      );
      const data = result.data || [];
      if (data.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
      }
      await exportPartners(data);
      alert('엑셀 다운로드가 완료되었습니다.');
    } catch (err) {
      logger.error('제휴업체 엑셀 다운로드 오류', err);
      const msg = getTimeoutFriendlyMessage(err) || getErrorMessage(err);
      alert(msg || '다운로드 중 오류가 발생했습니다.');
    } finally {
      setExcelDownloading(false);
    }
  };

  // 카테고리 토글
  const toggleCategory = (cat: string) => {
    setNewPartner((prev) => ({
      ...prev,
      service_categories: prev.service_categories.includes(cat)
        ? prev.service_categories.filter((c) => c !== cat)
        : [...prev.service_categories, cat],
    }));
  };

  const handlePaymentRequest = async () => {
    if (!paymentModal || !user?.id) return;
    const amount = parseInt(paymentAmount, 10);
    if (!amount || amount <= 0) {
      alert('금액을 입력해주세요.');
      return;
    }
    setPaymentSubmitting(true);
    try {
      await createPaymentRequest(paymentModal.partnerId, amount, paymentMemo.trim() || '', user.id);
      alert('결제 요청이 등록되었습니다.');
      setPaymentModal(null);
      setPaymentAmount('');
      setPaymentMemo('');
      refetch();
    } catch (e) {
      alert('등록 실패: ' + getErrorMessage(e));
    } finally {
      setPaymentSubmitting(false);
    }
  };

  // 제휴업체 등록 (서버 API 라우트 사용 — 클라이언트 signUp()으로 관리자 세션 교체되는 버그 방지)
  const handleAddPartner = async () => {
    if (!newPartner.email || !newPartner.password || !newPartner.business_name) {
      showError('필수 항목을 입력해주세요.');
      return;
    }

    if (newPartner.service_categories.length === 0) {
      showError('서비스 카테고리를 1개 이상 선택해주세요.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/partners/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          email: newPartner.email,
          password: newPartner.password,
          business_name: newPartner.business_name,
          manager_name: newPartner.manager_name,
          manager_phone: newPartner.manager_phone,
          service_categories: newPartner.service_categories,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showError(data.error || '등록에 실패했습니다.');
        return;
      }
      showSuccess('제휴업체가 등록되었습니다.');
      setShowAddModal(false);
      setNewPartner({
        email: '',
        password: '',
        business_name: '',
        manager_name: '',
        manager_phone: '',
        service_categories: [],
      });
      refetch();
    } catch (e) {
      logger.error('제휴업체 등록 오류', e);
      showError('등록 실패: ' + getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleBulkStatusChange = async () => {
    if (selectedIds.size === 0 || !bulkStatus) return;
    const label = bulkStatus === 'active' ? '활성' : '비활성';
    if (!confirm(`선택한 ${selectedIds.size}건의 제휴업체를 '${label}'으로 변경하시겠습니까?`)) return;
    setBulkUpdating(true);
    try {
      const res = await fetch('/api/admin/partners/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ partnerIds: [...selectedIds], status: bulkStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        showError(data.error || '일괄 상태변경에 실패했습니다.');
        return;
      }
      showSuccess(`${data.updated ?? 0}건 상태 변경 완료`);
      setSelectedIds(new Set());
      refetch();
    } catch (e) {
      logger.error('제휴업체 일괄 상태변경 오류', e);
      showError(getErrorMessage(e) || '일괄 상태변경에 실패했습니다.');
    } finally {
      setBulkUpdating(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 페이지 헤더 */}
        <div className="flex flex-wrap justify-between items-center mb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-gray-900">제휴업체 관리</h1>
            <p className="mt-1 text-sm text-gray-500">
              총 {total}개의 제휴업체가 등록되어 있습니다
            </p>
            <p className="mt-1 text-xs text-gray-400">
              홈페이지에서 신청만 한 업체는{' '}
              <Link href="/partner-applications" className="text-primary-600 hover:underline">
                가입 신청 (홈페이지 유입)
              </Link>
              에서 승인 후 여기에 표시됩니다.
            </p>
          </div>
          <div className="flex gap-2 items-center">
            <Button variant="secondary" onClick={handleExcelDownload} disabled={excelDownloading}>
              <Download className={`h-4 w-4 mr-2 ${excelDownloading ? 'animate-pulse' : ''}`} />
              {excelDownloading ? '다운로드 중...' : '엑셀 다운로드'}
            </Button>
            <Link href="/members/partners/signup">
              <Button variant="primary" type="button">
                <UserPlus className="h-4 w-4 mr-2" />
                회원가입
              </Button>
            </Link>
            <Button variant="secondary" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              빠른 등록
            </Button>
          </div>
        </div>

        {/* 검색 및 필터 */}
        <Card>
          <CardBody>
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="업체명, 담당자명, 연락처 검색..."
                  className="input pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <select
                  className="input w-40"
                  value={categoryFilter}
                  onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
                >
                  <option value="">업종 전체</option>
                  {categoryOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <select
                  className="input w-32"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                >
                  <option value="">상태 전체</option>
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                </select>
                <select
                  className="input w-44"
                  value={sortBy}
                  onChange={(e) => { setSortBy(e.target.value as MemberPartnerListSort); setPage(1); }}
                  title="정렬"
                >
                  <option value="created_at">가입일순</option>
                  <option value="rating_asc">평점 낮은순</option>
                  <option value="complaint_desc">불만 많은순</option>
                  <option value="assignment_desc">요청(배정) 많은순</option>
                </select>
              </div>
            </div>
          </CardBody>
        </Card>

        {loadErrorMsg && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm">
            {loadErrorMsg}
            <span className="ml-2">아래 [새로고침]으로 다시 시도할 수 있습니다.</span>
          </div>
        )}

        {/* 테이블 */}
        <Card>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : (
            <>
              {/* 일괄 작업 바 */}
              {partners.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
                  <button
                    type="button"
                    onClick={() => setSelectedIds(selectedIds.size === partners.length ? new Set() : new Set(partners.map((p: any) => p.id)))}
                    className="flex items-center gap-1.5 text-sm text-gray-700 hover:text-gray-900"
                  >
                    <input
                      type="checkbox"
                      checked={partners.length > 0 && selectedIds.size === partners.length}
                      readOnly
                      className="rounded border-gray-300 text-primary-600"
                    />
                    전체 선택 ({partners.length}건)
                  </button>
                  {selectedIds.size > 0 && (
                    <>
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold px-2.5 py-1">
                        {selectedIds.size}건 선택됨
                      </span>
                      <select
                        className="input w-28 py-1.5 text-sm"
                        value={bulkStatus}
                        onChange={(e) => setBulkStatus((e.target.value || '') as 'active' | 'inactive' | '')}
                        title="상태 선택"
                      >
                        <option value="">상태 선택</option>
                        <option value="active">활성</option>
                        <option value="inactive">비활성</option>
                      </select>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleBulkStatusChange}
                        disabled={!bulkStatus || bulkUpdating}
                      >
                        {bulkUpdating ? '처리 중...' : '일괄 상태변경'}
                      </Button>
                    </>
                  )}
                </div>
              )}
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-10">
                        <input
                          type="checkbox"
                          checked={partners.length > 0 && selectedIds.size === partners.length}
                          onChange={() => setSelectedIds(selectedIds.size === partners.length ? new Set() : new Set(partners.map((p: any) => p.id)))}
                          className="rounded border-gray-300 text-primary-600"
                        />
                      </th>
                      <th>업체명</th>
                      <th>사업자번호</th>
                      <th>대표자</th>
                      <th>담당자</th>
                      <th>연락처</th>
                      <th>업종</th>
                      <th>평균평점</th>
                      <th>가입일</th>
                      <th className="w-24">액션</th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="text-center py-8 text-gray-400">
                          등록된 제휴업체가 없습니다
                        </td>
                      </tr>
                    ) : (
                      partners.map((partner) => (
                        <tr key={partner.id}>
                          <td>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(partner.id)}
                              onChange={() => {
                                const next = new Set(selectedIds);
                                if (next.has(partner.id)) next.delete(partner.id);
                                else next.add(partner.id);
                                setSelectedIds(next);
                              }}
                              className="rounded border-gray-300 text-primary-600"
                            />
                          </td>
                          <td className="font-medium">{partner.business_name}</td>
                          <td className="text-sm text-gray-600">{partner.business_number || '-'}</td>
                          <td className="text-sm">{partner.representative_name || '-'}</td>
                          <td>{partner.manager_name || '-'}</td>
                          <td>
                            {partner.manager_phone ? (
                              <a href={`tel:${partner.manager_phone}`} className="flex items-center text-primary-600">
                                <Phone className="h-4 w-4 mr-1" />
                                {partner.manager_phone}
                              </a>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td>
                            <div className="flex flex-wrap gap-1">
                              {partner.service_categories?.map((cat: string) => (
                                <StatusBadge
                                  key={cat}
                                  label={SERVICE_CATEGORY_LABELS[cat as ServiceCategory]}
                                  variant="blue"
                                />
                              ))}
                              {(!partner.service_categories || partner.service_categories.length === 0) && '-'}
                            </div>
                          </td>
                          <td>
                            {partner.avg_rating != null && (partner.total_reviews || 0) > 0 ? (
                              <div className="flex items-center">
                                <Star className="h-4 w-4 text-yellow-400 fill-yellow-400 mr-1" />
                                <span>{Number(partner.avg_rating).toFixed(1)}</span>
                              </div>
                            ) : (
                              <span className="text-gray-400 text-sm">평점 없음</span>
                            )}
                          </td>
                          <td className="text-gray-500 text-sm">
                            {partner.created_at ? new Date(partner.created_at).toLocaleDateString('ko-KR') : '-'}
                          </td>
                          <td>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="secondary"
                                size="sm"
                                type="button"
                                onClick={() => setPaymentModal({ partnerId: partner.id, partnerName: partner.business_name })}
                              >
                                결제요청
                              </Button>
                              <a href={`/members/partners/${partner.id}`} className="text-primary-600 p-1" title="상세">
                                <Eye className="h-5 w-5" />
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                  <div className="text-sm text-gray-500">
                    총 {total}건 중 {(page - 1) * 20 + 1}-{Math.min(page * 20, total)}건 표시
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = Math.max(1, page - 2) + i;
                      if (p > totalPages) return null;
                      return (
                        <Button
                          key={p}
                          variant={p === page ? 'primary' : 'secondary'}
                          size="sm"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      );
                    })}
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page === totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* 업체 등록 모달 */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">제휴업체 등록</h2>
              <button onClick={() => setShowAddModal(false)}>
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  이메일 (로그인 ID) *
                </label>
                <input
                  type="email"
                  className="input"
                  placeholder="partner@example.com"
                  value={newPartner.email}
                  onChange={(e) => setNewPartner({ ...newPartner, email: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  비밀번호 *
                </label>
                <input
                  type="password"
                  className="input"
                  placeholder="8자 이상"
                  value={newPartner.password}
                  onChange={(e) => setNewPartner({ ...newPartner, password: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  업체명 *
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="업체명을 입력하세요"
                  value={newPartner.business_name}
                  onChange={(e) => setNewPartner({ ...newPartner, business_name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  담당자명
                </label>
                <input
                  type="text"
                  className="input"
                  placeholder="담당자명"
                  value={newPartner.manager_name}
                  onChange={(e) => setNewPartner({ ...newPartner, manager_name: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  연락처
                </label>
                <input
                  type="tel"
                  className="input"
                  placeholder="010-0000-0000"
                  value={newPartner.manager_phone}
                  onChange={(e) => setNewPartner({ ...newPartner, manager_phone: e.target.value })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  서비스 카테고리 *
                </label>
                <div className="flex flex-wrap gap-2">
                  {categoryOptions.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => toggleCategory(cat.value)}
                      className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                        newPartner.service_categories.includes(cat.value)
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowAddModal(false)}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="flex-1"
                onClick={handleAddPartner}
                disabled={submitting}
              >
                {submitting ? '등록 중...' : '등록하기'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 결제요청 모달 */}
      {paymentModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">결제 요청</h2>
              <button onClick={() => { setPaymentModal(null); setPaymentAmount(''); setPaymentMemo(''); }}>
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-gray-600">업체: <strong>{paymentModal.partnerName}</strong></p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">금액 (원) *</label>
                <input
                  type="number"
                  className="input w-full"
                  placeholder="금액 입력"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  min={1}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">메모</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="메모 (선택)"
                  value={paymentMemo}
                  onChange={(e) => setPaymentMemo(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="secondary" className="flex-1" onClick={() => { setPaymentModal(null); setPaymentAmount(''); setPaymentMemo(''); }}>
                취소
              </Button>
              <Button variant="primary" className="flex-1" onClick={handlePaymentRequest} disabled={paymentSubmitting || !paymentAmount}>
                {paymentSubmitting ? '등록 중...' : '요청하기'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
