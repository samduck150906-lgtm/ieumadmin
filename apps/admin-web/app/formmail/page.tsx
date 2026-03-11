'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Search,
  UserPlus,
  Shuffle,
  RefreshCw,
  X,
  MessageSquare,
  Download,
  CheckSquare,
  Filter,
  Star,
  FilePlus,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/lib/auth';
import {
  getCustomersWithRequests,
  updateServiceRequestStatus,
  updateServiceRequestMemo,
  updatePartnerAssignmentAmounts,
  assignPartner,
  assignRandomPartner,
  bulkAssignPartners,
  listMemosForServiceRequest,
  addServiceRequestMemo,
} from '@/lib/api/requests';
import { getPartnersByCategory, getPartners } from '@/lib/api/partners';
import {
  SERVICE_CATEGORY_LABELS,
  HQ_STATUS_LABELS,
  HQ_STATUS_VARIANTS,
  PARTNER_STATUS_LABELS,
  AREA_SIZE_LABELS,
  RATING_LABELS,
} from '@/types/database';
import type { HqStatus, ServiceCategory, PartnerStatus, RatingType } from '@/types/database';
import { showError, showSuccess } from '@/lib/toast';
import { getErrorMessage } from '@/lib/logger';

// ── 서비스 카테고리 키 ──────────────────────
const CATEGORY_KEYS: ServiceCategory[] = [
  'moving',
  'cleaning',
  'internet_tv',
  'interior',
  'appliance_rental',
  'kiosk',
];

// ── 타입 ────────────────────────────────────
type RequestRow = {
  id: string;
  category: ServiceCategory;
  hq_status: HqStatus;
  hq_memo?: string | null;
  assigned_partner_id?: string | null;
  assigned_partner?: { business_name: string; manager_name?: string; manager_phone?: string } | null;
  partner_assignment?: {
    id: string;
    status: PartnerStatus;
    installation_date?: string | null;
    realtor_commission_amount?: number | null;
    realtor_commission_complete_amount?: number | null;
    partner_payment_request_amount?: number | null;
  } | {
    id: string;
    status: PartnerStatus;
    installation_date?: string | null;
    realtor_commission_amount?: number | null;
    realtor_commission_complete_amount?: number | null;
    partner_payment_request_amount?: number | null;
  }[] | null;
  created_at?: string;
};

type CustomerRow = {
  id: string;
  name: string;
  phone: string;
  moving_date?: string | null;
  moving_address?: string | null;
  current_address?: string | null;
  area_size?: string | null;
  area_pyeong_exact?: number | null;
  created_at?: string;
  source_realtor?: { business_name: string } | null;
  service_requests?: RequestRow[];
};

type UnifiedMemo = {
  id: string;
  content: string;
  created_at: string;
  created_by: string | null;
  created_by_user?: { name?: string; email?: string } | null;
};

function formatDate(d?: string | null) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('ko-KR');
}

function formatPhone(phone?: string) {
  if (!phone) return '-';
  const c = phone.replace(/[^0-9]/g, '');
  if (c.length === 11) return `${c.slice(0, 3)}-${c.slice(3, 7)}-${c.slice(7)}`;
  if (c.length === 10) return `${c.slice(0, 3)}-${c.slice(3, 6)}-${c.slice(6)}`;
  return phone;
}

export default function FormMailPage() {
  const { user } = useAuth();

  // ── 데이터 상태 ──────────────────────────────
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // ── 필터 ──────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // ── 선택 (크로스 페이지) ──────────────────────
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // ── 배정 모달 ─────────────────────────────────
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState<RequestRow | null>(null);
  const [availablePartners, setAvailablePartners] = useState<{ id: string; business_name: string; avg_rating?: number }[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [assigning, setAssigning] = useState(false);

  // ── 메모 모달 ─────────────────────────────────
  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoTarget, setMemoTarget] = useState<RequestRow | null>(null);
  const [unifiedMemos, setUnifiedMemos] = useState<UnifiedMemo[]>([]);
  const [newMemoText, setNewMemoText] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [loadingMemos, setLoadingMemos] = useState(false);
  // ── 수익쉐어 건바이건 입력 ─────────────────────────────────
  const [realtorCommissionAmount, setRealtorCommissionAmount] = useState('');
  const [realtorCommissionCompleteAmount, setRealtorCommissionCompleteAmount] = useState('');
  const [partnerPaymentRequestAmount, setPartnerPaymentRequestAmount] = useState('');
  const [savingAmounts, setSavingAmounts] = useState(false);

  // ── 일괄 선택 배정 ────────────────────────────
  const [showBulkAssignModal, setShowBulkAssignModal] = useState(false);
  const [bulkPartners, setBulkPartners] = useState<{ id: string; business_name: string }[]>([]);
  const [bulkPartnerId, setBulkPartnerId] = useState('');
  const [bulkAssigning, setBulkAssigning] = useState(false);

  // ── 일괄 상태 변경 (2/12 수정사항 반영) ────────
  const [bulkStatusValue, setBulkStatusValue] = useState<HqStatus | ''>('');
  const [bulkStatusApplying, setBulkStatusApplying] = useState(false);

  // ── 리뷰 발송 ─────────────────────────────────
  const [sendingReview, setSendingReview] = useState<string | null>(null);

  // ── 폼 데이터 수동 등록 (고객 폼메일 → DB 연동) ─
  const [showImportModal, setShowImportModal] = useState(false);
  const [importForm, setImportForm] = useState({ name: '', phone: '', services: [] as string[], area_pyeong_exact: '', memo: '' });
  const [importing, setImporting] = useState(false);

  const PAGE_SIZE_OPTIONS = [20, 50, 100, 300];

  // ── 데이터 로드 ───────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 카테고리 필터는 첫 번째만 API에 전달 (다중은 클라이언트 필터링)
      const catFilter = selectedCategories.length === 1 ? selectedCategories[0] as ServiceCategory : undefined;

      const result = await getCustomersWithRequests({
        search: searchTerm || undefined,
        status: (statusFilter as HqStatus) || undefined,
        category: catFilter,
        page,
        limit: pageSize,
      });

      let data = result.data || [];

      // 다중 카테고리 필터: 클라이언트 측에서 추가 필터링
      if (selectedCategories.length > 1) {
        data = data.filter((c: CustomerRow) =>
          (c.service_requests ?? []).some((r: RequestRow) =>
            selectedCategories.includes(r.category)
          )
        );
      }

      // 날짜 범위 필터
      if (dateFrom) {
        data = data.filter((c: CustomerRow) =>
          c.created_at && new Date(c.created_at) >= new Date(dateFrom)
        );
      }
      if (dateTo) {
        const end = new Date(dateTo);
        end.setHours(23, 59, 59, 999);
        data = data.filter((c: CustomerRow) =>
          c.created_at && new Date(c.created_at) <= end
        );
      }

      setCustomers(data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch (err) {
      showError('데이터 로드 오류: ' + getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, selectedCategories, dateFrom, dateTo, page, pageSize]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    const t = setTimeout(() => { setPage(1); setSelectedIds([]); }, 300);
    return () => clearTimeout(t);
  }, [searchTerm, selectedCategories, statusFilter, dateFrom, dateTo]);

  // ── 헬퍼 ─────────────────────────────────────
  const getAllRequestIds = useCallback((): string[] => {
    return customers.flatMap(c => (c.service_requests ?? []).map(r => r.id));
  }, [customers]);

  // ── 체크박스 indeterminate ────────────────────
  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    const ids = getAllRequestIds();
    const sel = ids.filter(id => selectedIds.includes(id));
    if (sel.length === 0) {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = false;
    } else if (sel.length === ids.length) {
      headerCheckboxRef.current.checked = true;
      headerCheckboxRef.current.indeterminate = false;
    } else {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = true;
    }
  }, [selectedIds, customers, getAllRequestIds]);

  // ── 메모 로드 ─────────────────────────────────
  useEffect(() => {
    if (!showMemoModal || !memoTarget) return;
    setLoadingMemos(true);
    listMemosForServiceRequest(memoTarget.id)
      .then(setUnifiedMemos)
      .catch(() => {
        setUnifiedMemos([]);
        showError('메모를 불러오지 못했습니다. 다시 시도해 주세요.');
      })
      .finally(() => setLoadingMemos(false));
  }, [showMemoModal, memoTarget]);

  // ── 메모 모달 열릴 때 수익쉐어 값 초기화 (배정된 건만) ─────
  useEffect(() => {
    if (!memoTarget) return;
    const pa = Array.isArray(memoTarget.partner_assignment)
      ? memoTarget.partner_assignment[0]
      : memoTarget.partner_assignment ?? null;
    if (pa) {
      setRealtorCommissionAmount(pa.realtor_commission_amount != null ? String(pa.realtor_commission_amount) : '');
      setRealtorCommissionCompleteAmount(pa.realtor_commission_complete_amount != null ? String(pa.realtor_commission_complete_amount) : '');
      setPartnerPaymentRequestAmount(pa.partner_payment_request_amount != null ? String(pa.partner_payment_request_amount) : '');
    } else {
      setRealtorCommissionAmount('');
      setRealtorCommissionCompleteAmount('');
      setPartnerPaymentRequestAmount('');
    }
  }, [memoTarget]);

  function toggleCategory(cat: string) {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  }

  function togglePageSelect() {
    const ids = getAllRequestIds();
    const allSelected = ids.every(id => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds(prev => prev.filter(id => !ids.includes(id)));
    } else {
      setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
    }
  }

  function toggleRow(id: string) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  // ── 전체 선택 (필터 전체, 크로스 페이지) ──────
  async function handleSelectAllFiltered() {
    try {
      const res = await getCustomersWithRequests({
        search: searchTerm || undefined,
        status: (statusFilter as HqStatus) || undefined,
        category: selectedCategories.length === 1 ? selectedCategories[0] as ServiceCategory : undefined,
        page: 1,
        limit: 9999,
      });
      const allIds: string[] = [];
      (res.data || []).forEach((c: CustomerRow) =>
        (c.service_requests ?? []).forEach((r: RequestRow) => allIds.push(r.id))
      );
      setSelectedIds(allIds);
      showSuccess(`${allIds.length}건 전체 선택`);
    } catch {
      showError('전체 선택에 실패했습니다.');
    }
  }

  // ── 배정 ──────────────────────────────────────
  async function openAssignModal(request: RequestRow) {
    setAssignTarget(request);
    setSelectedPartnerId('');
    setShowAssignModal(true);
    try {
      const partners = await getPartnersByCategory(request.category);
      setAvailablePartners((partners ?? []) as { id: string; business_name: string; avg_rating?: number }[]);
    } catch {
      setAvailablePartners([]);
      showError('업체 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
    }
  }

  async function handleAssign() {
    if (!selectedPartnerId || !assignTarget || !user) return;
    setAssigning(true);
    try {
      await assignPartner(assignTarget.id, selectedPartnerId, user.id);
      showSuccess('배정 완료');
      setShowAssignModal(false);
      loadData();
    } catch (e) {
      showError('배정 실패: ' + getErrorMessage(e));
    } finally {
      setAssigning(false);
    }
  }

  async function handleRandomAssign() {
    if (!assignTarget || !user) return;
    setAssigning(true);
    try {
      const partner = await assignRandomPartner(assignTarget.id, assignTarget.category, user.id);
      showSuccess(`'${partner.business_name}'에 랜덤 배정 완료`);
      setShowAssignModal(false);
      loadData();
    } catch (e) {
      showError('랜덤 배정 실패: ' + getErrorMessage(e));
    } finally {
      setAssigning(false);
    }
  }

  // ── 일괄 배정 ─────────────────────────────────
  async function handleBulkRandomAssign() {
    if (selectedIds.length === 0 || !user) return;
    if (!confirm(`${selectedIds.length}건을 랜덤 배정하시겠습니까?`)) return;
    try {
      const results = await bulkAssignPartners(selectedIds, user.id, 'random');
      const ok = results.filter((r: { success: boolean }) => r.success).length;
      const fail = results.length - ok;
      showSuccess(`성공: ${ok}건, 실패: ${fail}건`);
      setSelectedIds([]);
      loadData();
    } catch (e) {
      showError('일괄 배정 실패: ' + getErrorMessage(e));
    }
  }

  function openBulkAssignModal() {
    setBulkPartnerId('');
    setBulkPartners([]);
    setShowBulkAssignModal(true);
    getPartners({ limit: 200 })
      .then(res => setBulkPartners(res.data.map((p: { id: string; business_name: string }) => ({ id: p.id, business_name: p.business_name }))))
      .catch(() => {
        setBulkPartners([]);
        showError('업체 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
      });
  }

  async function handleBulkSpecificAssign() {
    if (selectedIds.length === 0 || !bulkPartnerId || !user) return;
    const name = bulkPartners.find(p => p.id === bulkPartnerId)?.business_name ?? '';
    if (!confirm(`${selectedIds.length}건을 '${name}'에 배정하시겠습니까?`)) return;
    setBulkAssigning(true);
    try {
      const results = await bulkAssignPartners(selectedIds, user.id, 'specific', bulkPartnerId);
      const ok = results.filter((r: { success: boolean }) => r.success).length;
      showSuccess(`배정 완료: ${ok}건`);
      setSelectedIds([]);
      setShowBulkAssignModal(false);
      loadData();
    } catch (e) {
      showError('배정 실패: ' + getErrorMessage(e));
    } finally {
      setBulkAssigning(false);
    }
  }

  // ── 수익쉐어 건바이건 저장 ────────────────────
  async function handleSaveAmounts() {
    if (!memoTarget) return;
    const pa = Array.isArray(memoTarget.partner_assignment)
      ? memoTarget.partner_assignment[0]
      : memoTarget.partner_assignment ?? null;
    if (!pa) {
      showError('배정이 된 건만 수익쉐어 금액을 저장할 수 있습니다.');
      return;
    }
    setSavingAmounts(true);
    try {
      await updatePartnerAssignmentAmounts(memoTarget.id, {
        realtor_commission_amount: realtorCommissionAmount ? Number(realtorCommissionAmount) : null,
        realtor_commission_complete_amount: realtorCommissionCompleteAmount ? Number(realtorCommissionCompleteAmount) : null,
        partner_payment_request_amount: partnerPaymentRequestAmount ? Number(partnerPaymentRequestAmount) : null,
      });
      showSuccess('수익쉐어 금액이 저장되었습니다.');
      loadData();
    } catch (e) {
      showError('저장 실패: ' + getErrorMessage(e));
    } finally {
      setSavingAmounts(false);
    }
  }

  // ── 메모 추가 ─────────────────────────────────
  async function handleAddMemo() {
    if (!memoTarget || !newMemoText.trim() || !user) return;
    setSavingMemo(true);
    try {
      await addServiceRequestMemo(memoTarget.id, newMemoText.trim(), user.id);
      const list = await listMemosForServiceRequest(memoTarget.id);
      setUnifiedMemos(list);
      setNewMemoText('');
      showSuccess('메모 추가 완료');
    } catch (e) {
      showError('메모 추가 실패: ' + getErrorMessage(e));
    } finally {
      setSavingMemo(false);
    }
  }

  // ── 리뷰 발송 ─────────────────────────────────
  async function handleSendReview(requestId: string) {
    setSendingReview(requestId);
    try {
      const res = await fetch('/api/reviews/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_request_id: requestId }),
      });
      if (res.ok) {
        showSuccess('평가 요청이 발송되었습니다.');
      } else {
        const data = await res.json().catch(() => ({}));
        showError(data.error || '발송 실패');
      }
    } catch {
      showError('발송 중 오류 발생');
    } finally {
      setSendingReview(null);
    }
  }

  // ── 취소 피드백 발송 ──────────────────────────
  async function handleSendCancelFeedback(requestId: string) {
    try {
      const res = await fetch('/api/cancellation-feedback/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_request_id: requestId }),
      });
      if (res.ok) {
        showSuccess('취소 피드백 요청이 발송되었습니다.');
      } else {
        const data = await res.json().catch(() => ({}));
        showError(data.error || '발송 실패');
      }
    } catch {
      showError('발송 중 오류 발생');
    }
  }

  // ── 일괄 상태 변경 ────────────────────────────
  async function handleBulkStatusChange() {
    if (selectedIds.length === 0 || !bulkStatusValue) return;
    const label = HQ_STATUS_LABELS[bulkStatusValue] ?? bulkStatusValue;
    if (!confirm(`선택한 ${selectedIds.length}건의 본사 상태를 '${label}'으로 변경하시겠습니까?`)) return;
    setBulkStatusApplying(true);
    try {
      await Promise.all(selectedIds.map((id) => updateServiceRequestStatus(id, bulkStatusValue as HqStatus)));
      showSuccess(`${selectedIds.length}건 상태 변경 완료`);
      setSelectedIds([]);
      setBulkStatusValue('');
      loadData();
    } catch (e) {
      showError('일괄 상태 변경 실패: ' + getErrorMessage(e));
    } finally {
      setBulkStatusApplying(false);
    }
  }

  // ── 상태 변경 ─────────────────────────────────
  async function handleStatusChange(requestId: string, newStatus: HqStatus) {
    try {
      await updateServiceRequestStatus(requestId, newStatus);
      // 완료 시 리뷰 요청 자동 발송
      if (newStatus === 'settlement_done') {
        handleSendReview(requestId);
      }
      // 취소 시 피드백 요청 자동 발송
      if (newStatus === 'cancelled') {
        handleSendCancelFeedback(requestId);
      }
      loadData();
    } catch (e) {
      showError('상태 변경 실패: ' + getErrorMessage(e));
    }
  }

  // ── 폼 데이터 수동 등록 ────────────────────────
  async function handleImportSubmit() {
    if (!importForm.name.trim() || !importForm.phone.trim() || importForm.services.length === 0) {
      showError('이름, 연락처, 서비스를 입력해주세요.');
      return;
    }
    setImporting(true);
    try {
      const res = await fetch('/api/admin/import-customer', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: importForm.name.trim(),
          phone: importForm.phone.replace(/\D/g, ''),
          services: importForm.services,
          area_pyeong_exact: importForm.area_pyeong_exact ? parseFloat(importForm.area_pyeong_exact) : undefined,
          memo: importForm.memo.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({ success: false, error: '응답 파싱 실패' }));
      if (json.success) {
        showSuccess('폼 데이터가 DB에 등록되었습니다.');
        setShowImportModal(false);
        setImportForm({ name: '', phone: '', services: [], area_pyeong_exact: '', memo: '' });
        loadData();
      } else {
        showError(json.error || '등록 실패');
      }
    } catch (e) {
      showError('등록 중 오류: ' + getErrorMessage(e));
    } finally {
      setImporting(false);
    }
  }

  // ── 엑셀 다운로드 ─────────────────────────────
  function handleExcelDownload() {
    const headers = ['고객명', '연락처', '서비스', '이사일', '주소', '평수', '정확평수', '유입처', '본사상태', '접수일'];
    const rows = customers.flatMap(c =>
      (c.service_requests ?? []).map(r => [
        c.name,
        formatPhone(c.phone),
        SERVICE_CATEGORY_LABELS[r.category] || r.category,
        formatDate(c.moving_date),
        c.moving_address || '-',
        c.area_size ? AREA_SIZE_LABELS[c.area_size] || c.area_size : '-',
        (c as { area_pyeong_exact?: number | null }).area_pyeong_exact != null ? `${(c as { area_pyeong_exact: number }).area_pyeong_exact}평` : '-',
        c.source_realtor?.business_name || '-',
        HQ_STATUS_LABELS[r.hq_status] || r.hq_status,
        formatDate(r.created_at),
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    );
    const bom = '\uFEFF';
    const csv = bom + headers.join(',') + '\n' + rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `폼메일_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── 렌더 ──────────────────────────────────────
  return (
    <AdminLayout>
      <div className="space-y-4">
        {/* ─ 선택 일괄 액션 바 ─ */}
        {selectedIds.length > 0 && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 py-3 px-4 rounded-xl bg-primary-600 text-white shadow-lg">
            <span className="font-semibold flex items-center gap-1.5">
              <CheckSquare className="h-4 w-4" />
              {selectedIds.length}건 선택 중
            </span>
            <Button variant="secondary" size="sm" className="!bg-white/90 !text-primary-800" onClick={handleBulkRandomAssign}>
              <Shuffle className="h-3.5 w-3.5 mr-1" /> 일괄 랜덤 배정
            </Button>
            <Button variant="secondary" size="sm" className="!bg-white/90 !text-primary-800" onClick={openBulkAssignModal}>
              <UserPlus className="h-3.5 w-3.5 mr-1" /> 일괄 선택 배정
            </Button>
            <select
              value={bulkStatusValue}
              onChange={(e) => setBulkStatusValue(e.target.value as HqStatus | '')}
              className="h-8 px-3 rounded-lg text-sm font-medium bg-white/90 text-primary-800 border-0"
            >
              <option value="">일괄 상태 변경</option>
              <option value="unread">미배정</option>
              <option value="read">열람</option>
              <option value="assigned">배정완료</option>
              <option value="settlement_check">정산확인</option>
              <option value="settlement_done">정산완료</option>
              <option value="hq_review_needed">본사확인필요</option>
              <option value="cancelled">취소</option>
            </select>
            <Button
              variant="secondary"
              size="sm"
              className="!bg-white/90 !text-primary-800"
              onClick={handleBulkStatusChange}
              disabled={!bulkStatusValue || bulkStatusApplying}
            >
              {bulkStatusApplying ? '적용 중...' : '적용'}
            </Button>
            <Button variant="secondary" size="sm" className="!bg-white/20 !text-white" onClick={() => setSelectedIds([])}>
              <X className="h-3.5 w-3.5 mr-1" /> 선택 해제
            </Button>
          </div>
        )}

        {/* ─ 헤더 ─ */}
        <div className="flex flex-wrap justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">폼메일 관리</h1>
            <p className="mt-1 text-sm text-gray-500">
              총 {total}건 · 폼메일을 통해 접수된 고객 DB를 관리합니다
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
              className="input w-20 py-1.5 text-sm"
            >
              {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}건</option>)}
            </select>
            <Button variant="secondary" size="sm" onClick={() => setShowImportModal(true)}>
              <FilePlus className="h-4 w-4 mr-1" /> 폼 등록
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExcelDownload}>
              <Download className="h-4 w-4 mr-1" /> 엑셀
            </Button>
            <Button variant="secondary" size="sm" onClick={handleSelectAllFiltered}>
              필터 전체 ({total}건)
            </Button>
            <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        </div>

        {/* ─ 필터 ─ */}
        <Card>
          <CardBody className="space-y-4">
            {/* 서비스 카테고리 체크박스 */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                <Filter className="h-4 w-4" /> 서비스 카테고리 (추후 추가 가능)
              </p>
              <div className="flex flex-wrap gap-3">
                {CATEGORY_KEYS.map(cat => (
                  <label key={cat} className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedCategories.includes(cat)}
                      onChange={() => toggleCategory(cat)}
                      className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm">{SERVICE_CATEGORY_LABELS[cat]}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 검색 + 상태 필터 + 날짜 범위 */}
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">검색</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="고객명, 연락처, 주소 검색..."
                    className="input pl-9 w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">본사 상태</label>
                <select
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                  className="input py-2 w-32"
                >
                  <option value="">전체</option>
                  <option value="unread">미배정</option>
                  <option value="read">열람</option>
                  <option value="assigned">배정완료</option>
                  <option value="settlement_check">정산확인</option>
                  <option value="settlement_done">정산완료</option>
                  <option value="cancelled">취소</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">시작일</label>
                <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input py-2" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">종료일</label>
                <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input py-2" />
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setSearchTerm(''); setStatusFilter(''); setSelectedCategories([]); setDateFrom(''); setDateTo(''); }}
              >
                초기화
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* ─ 테이블 ─ */}
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-3 text-left w-10">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      onChange={togglePageSelect}
                      className="rounded border-gray-300 text-brand-600"
                    />
                  </th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">고객명</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">연락처</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">서비스 (묶음)</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">이사일자</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">이사 주소</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">평수</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">정확평수</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">유입처</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">본사 상태</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">제휴업체 상태</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">배정 파트너</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">접수일</th>
                  <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">관리</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {loading ? (
                  <tr><td colSpan={14} className="px-3 py-12 text-center text-gray-400">불러오는 중...</td></tr>
                ) : customers.length === 0 ? (
                  <tr><td colSpan={14} className="px-3 py-12 text-center text-gray-400">데이터가 없습니다.</td></tr>
                ) : (
                  customers.map(customer => {
                    const requests = customer.service_requests ?? [];

                    return requests.map((req, idx) => {
                      const pa = Array.isArray(req.partner_assignment) ? req.partner_assignment[0] : req.partner_assignment;

                      return (
                        <tr
                          key={req.id}
                          className={`hover:bg-gray-50 ${selectedIds.includes(req.id) ? 'bg-primary-50' : ''}`}
                        >
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(req.id)}
                              onChange={() => toggleRow(req.id)}
                              className="rounded border-gray-300 text-brand-600"
                            />
                          </td>
                          {/* 고객명: 첫 번째 서비스요청에서만 표시 (rowSpan 효과) */}
                          <td className="px-3 py-3 font-medium whitespace-nowrap">
                            {idx === 0 ? customer.name : ''}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap text-sm">
                            {idx === 0 ? formatPhone(customer.phone) : ''}
                          </td>
                          {/* 서비스 (묶음 뱃지) */}
                          <td className="px-3 py-3">
                            {idx === 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {requests.map(r => (
                                  <span key={r.id} className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                                    {SERVICE_CATEGORY_LABELS[r.category] || r.category}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-gray-400">
                                {SERVICE_CATEGORY_LABELS[req.category] || req.category}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-sm whitespace-nowrap">
                            {idx === 0 ? formatDate(customer.moving_date) : ''}
                          </td>
                          <td className="px-3 py-3 text-sm max-w-[200px] truncate">
                            {idx === 0 ? (customer.moving_address || '-') : ''}
                          </td>
                          <td className="px-3 py-3 text-sm whitespace-nowrap">
                            {idx === 0 && customer.area_size ? (AREA_SIZE_LABELS[customer.area_size] || customer.area_size) : (idx === 0 ? '-' : '')}
                          </td>
                          <td className="px-3 py-3 text-sm whitespace-nowrap">
                            {idx === 0 && customer.area_pyeong_exact != null ? `${customer.area_pyeong_exact}평` : (idx === 0 ? '-' : '')}
                          </td>
                          <td className="px-3 py-3 text-sm whitespace-nowrap">
                            {idx === 0 ? (customer.source_realtor?.business_name || '-') : ''}
                          </td>
                          {/* 본사 상태 */}
                          <td className="px-3 py-3">
                            <StatusBadge
                              label={HQ_STATUS_LABELS[req.hq_status] || req.hq_status}
                              variant={HQ_STATUS_VARIANTS[req.hq_status] ?? 'gray'}
                            />
                          </td>
                          {/* 제휴업체 상태 */}
                          <td className="px-3 py-3">
                            {pa ? (
                              <StatusBadge
                                label={PARTNER_STATUS_LABELS[pa.status] || pa.status}
                              />
                            ) : '-'}
                          </td>
                          <td className="px-3 py-3 text-sm whitespace-nowrap">
                            {req.assigned_partner?.business_name || '-'}
                          </td>
                          <td className="px-3 py-3 text-sm whitespace-nowrap">
                            {formatDate(req.created_at)}
                          </td>
                          {/* 관리 */}
                          <td className="px-3 py-3">
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => { setMemoTarget(req); setShowMemoModal(true); setNewMemoText(''); }}
                                className="p-1 rounded hover:bg-gray-100 text-gray-600" title="메모"
                              >
                                <MessageSquare className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => openAssignModal(req)}
                                className="p-1 rounded hover:bg-blue-50 text-blue-600" title="배정"
                              >
                                <UserPlus className="h-4 w-4" />
                              </button>
                              {/* 완료 시 리뷰 발송 버튼 */}
                              {pa?.status === 'completed' && (
                                <button
                                  onClick={() => handleSendReview(req.id)}
                                  disabled={sendingReview === req.id}
                                  className="p-1 rounded hover:bg-yellow-50 text-yellow-600" title="리뷰 요청 발송"
                                >
                                  <Star className="h-4 w-4" />
                                </button>
                              )}
                              {/* 상태 변경 드롭다운 */}
                              <select
                                value={req.hq_status}
                                onChange={e => handleStatusChange(req.id, e.target.value as HqStatus)}
                                className="text-xs border rounded py-0.5 px-1"
                              >
                                <option value="unread">미배정</option>
                                <option value="read">열람</option>
                                <option value="assigned">배정완료</option>
                                <option value="settlement_check">정산확인</option>
                                <option value="settlement_done">정산완료</option>
                                <option value="cancelled">취소</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                      );
                    });
                  })
                )}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ─ 페이지네이션 ─ */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(1)}>&laquo;</Button>
            <Button variant="secondary" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>&lsaquo;</Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(totalPages - 4, page - 2)) + i;
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
            <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>&rsaquo;</Button>
            <Button variant="secondary" size="sm" disabled={page === totalPages} onClick={() => setPage(totalPages)}>&raquo;</Button>
          </div>
        )}

        {/* ─ 메모 모달 ─ */}
        {showMemoModal && memoTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-bottom-sheet" onClick={() => setShowMemoModal(false)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-lg shadow-xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">
                메모 — {SERVICE_CATEGORY_LABELS[memoTarget.category] || memoTarget.category}
              </h2>

              {/* 기존 메모 목록 */}
              <div className="max-h-60 overflow-y-auto space-y-2 mb-4">
                {loadingMemos ? (
                  <p className="text-sm text-gray-500 text-center py-4">메모 불러오는 중...</p>
                ) : unifiedMemos.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-4">아직 메모가 없습니다.</p>
                ) : (
                  unifiedMemos.map(m => (
                    <div key={m.id} className="p-3 bg-gray-50 rounded-lg text-sm">
                      <p>{m.content}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        {m.created_by_user?.name || '알 수 없음'} · {formatDate(m.created_at)}
                      </p>
                    </div>
                  ))
                )}
              </div>

              {/* 수익쉐어 건바이건 (배정된 건만) */}
              {(Array.isArray(memoTarget.partner_assignment)
                ? memoTarget.partner_assignment[0]
                : memoTarget.partner_assignment) && (
                <div className="mb-4 p-3 bg-gray-50 rounded-lg space-y-2">
                  <p className="text-xs font-medium text-gray-600 mb-2">수익쉐어 건바이건</p>
                  <div className="grid grid-cols-1 gap-2">
                    <label className="text-xs text-gray-500">
                      공인중개사 수익쉐어(상담) <input type="number" value={realtorCommissionAmount} onChange={e => setRealtorCommissionAmount(e.target.value)} className="ml-1 w-24 border rounded px-2 py-1 text-sm" placeholder="원" />
                    </label>
                    <label className="text-xs text-gray-500">
                      공인중개사 수익쉐어(완료) <input type="number" value={realtorCommissionCompleteAmount} onChange={e => setRealtorCommissionCompleteAmount(e.target.value)} className="ml-1 w-24 border rounded px-2 py-1 text-sm" placeholder="원" />
                    </label>
                    <label className="text-xs text-gray-500">
                      제휴업체 청구금액 <input type="number" value={partnerPaymentRequestAmount} onChange={e => setPartnerPaymentRequestAmount(e.target.value)} className="ml-1 w-24 border rounded px-2 py-1 text-sm" placeholder="원" />
                    </label>
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleSaveAmounts} disabled={savingAmounts} className="mt-2">
                    {savingAmounts ? '저장 중...' : '금액 저장'}
                  </Button>
                </div>
              )}

              {/* 새 메모 입력 */}
              <textarea
                value={newMemoText}
                onChange={e => setNewMemoText(e.target.value)}
                className="w-full border rounded-xl px-3 py-2 text-sm h-20 resize-none"
                placeholder="새 메모를 입력하세요..."
              />
              <div className="flex justify-end gap-2 mt-3">
                <Button variant="secondary" onClick={() => setShowMemoModal(false)}>닫기</Button>
                <Button variant="primary" onClick={handleAddMemo} disabled={savingMemo || !newMemoText.trim()}>
                  {savingMemo ? '저장 중...' : '메모 추가'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─ 배정 모달 ─ */}
        {showAssignModal && assignTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-bottom-sheet" onClick={() => setShowAssignModal(false)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">
                파트너 배정 — {SERVICE_CATEGORY_LABELS[assignTarget.category] || assignTarget.category}
              </h2>

              <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                {availablePartners.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">배정 가능한 파트너가 없습니다.</p>
                ) : (
                  availablePartners.map(p => (
                    <label key={p.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${selectedPartnerId === p.id ? 'bg-blue-50' : ''}`}>
                      <input
                        type="radio"
                        name="partner"
                        checked={selectedPartnerId === p.id}
                        onChange={() => setSelectedPartnerId(p.id)}
                        className="text-brand-600"
                      />
                      <div>
                        <p className="text-sm font-medium">{p.business_name}</p>
                        {p.avg_rating && <p className="text-xs text-gray-500">평점: {p.avg_rating.toFixed(1)}</p>}
                      </div>
                    </label>
                  ))
                )}
              </div>

              <div className="flex justify-between mt-4">
                <Button variant="secondary" onClick={handleRandomAssign} disabled={assigning}>
                  <Shuffle className="h-4 w-4 mr-1" /> 랜덤 배정
                </Button>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setShowAssignModal(false)}>취소</Button>
                  <Button variant="primary" onClick={handleAssign} disabled={assigning || !selectedPartnerId}>
                    {assigning ? '배정 중...' : '배정'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─ 일괄 배정 모달 ─ */}
        {showBulkAssignModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-bottom-sheet" onClick={() => setShowBulkAssignModal(false)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">일괄 선택 배정 ({selectedIds.length}건)</h2>

              <div className="max-h-60 overflow-y-auto border rounded-lg divide-y">
                {bulkPartners.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">파트너를 불러오는 중...</p>
                ) : (
                  bulkPartners.map(p => (
                    <label key={p.id} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 ${bulkPartnerId === p.id ? 'bg-blue-50' : ''}`}>
                      <input
                        type="radio"
                        name="bulkPartner"
                        checked={bulkPartnerId === p.id}
                        onChange={() => setBulkPartnerId(p.id)}
                        className="text-brand-600"
                      />
                      <span className="text-sm font-medium">{p.business_name}</span>
                    </label>
                  ))
                )}
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => setShowBulkAssignModal(false)}>취소</Button>
                <Button variant="primary" onClick={handleBulkSpecificAssign} disabled={bulkAssigning || !bulkPartnerId}>
                  {bulkAssigning ? '배정 중...' : '배정'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ─ 폼 데이터 수동 등록 모달 (고객 폼메일 → DB 연동) ─ */}
        {showImportModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 modal-bottom-sheet" onClick={() => setShowImportModal(false)}>
            <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
              <h2 className="text-lg font-bold mb-4">폼 데이터 등록</h2>
              <p className="text-sm text-gray-500 mb-4">이메일 등으로 받은 고객 폼 데이터를 DB에 등록합니다.</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">이름 *</label>
                  <input
                    type="text"
                    value={importForm.name}
                    onChange={e => setImportForm(f => ({ ...f, name: e.target.value }))}
                    className="input w-full"
                    placeholder="홍길동"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">연락처 *</label>
                  <input
                    type="tel"
                    value={importForm.phone}
                    onChange={e => setImportForm(f => ({ ...f, phone: e.target.value }))}
                    className="input w-full"
                    placeholder="01012345678"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">서비스 *</label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORY_KEYS.map(cat => (
                      <label key={cat} className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={importForm.services.includes(cat)}
                          onChange={() => {
                            setImportForm(f => ({
                              ...f,
                              services: f.services.includes(cat)
                                ? f.services.filter(s => s !== cat)
                                : [...f.services, cat],
                            }));
                          }}
                          className="rounded border-gray-300 text-brand-600"
                        />
                        <span className="text-sm">{SERVICE_CATEGORY_LABELS[cat]}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">정확한 평수 (선택)</label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    step="0.5"
                    value={importForm.area_pyeong_exact}
                    onChange={e => setImportForm(f => ({ ...f, area_pyeong_exact: e.target.value }))}
                    className="input w-full"
                    placeholder="예: 15.5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">메모</label>
                  <textarea
                    value={importForm.memo}
                    onChange={e => setImportForm(f => ({ ...f, memo: e.target.value }))}
                    className="input w-full h-20 resize-none"
                    placeholder="추가 메모"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="secondary" onClick={() => setShowImportModal(false)}>취소</Button>
                <Button variant="primary" onClick={handleImportSubmit} disabled={importing || !importForm.name.trim() || !importForm.phone.trim() || importForm.services.length === 0}>
                  {importing ? '등록 중...' : '등록'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
