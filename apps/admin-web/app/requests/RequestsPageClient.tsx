'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Eye,
  UserPlus,
  Shuffle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  X,
  MessageSquare,
  Save,
  Download,
  CheckSquare,
  ListChecks,
  DollarSign,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/lib/auth';
import {
  getCustomersWithRequests,
  updateServiceRequestStatus,
  updateServiceRequestMemo,
  updateServiceRequestRequestedProduct,
  updatePartnerAssignmentAmounts,
  assignPartner,
  assignRandomPartner,
  bulkAssignPartners,
  bulkUnassignAssignments,
  updatePartnerAssignmentStatus,
  getServiceRequestStats,
  getUnassignedCountByCategory,
  getDelayedAssignments,
  listMemosForServiceRequest,
  addServiceRequestMemo,
  getBatchStatusHistory,
  getBatchMemoCounts,
  type StatusHistoryEntry,
} from '@/lib/api/requests';
import { getPartnersByCategory, getPartners } from '@/lib/api/partners';
import { getRealtorRevenueShareDefaults } from '@/lib/api/settings';
import type { RealtorRevenueShareDefault } from '@/lib/api/settings';
import {
  SERVICE_CATEGORY_LABELS,
  PARTNER_STATUS_LABELS,
  PARTNER_CANCEL_REASON_LABELS,
  HqStatus,
  ServiceCategory,
  AREA_SIZE_LABELS,
} from '@/types/database';
import type { PartnerStatus, PartnerCancelReason } from '@/types/database';
import type { RequestRow, CustomerRow, UnifiedMemo } from './requests-types';
import { normalizeServiceRequests, getRequestIdsFromCustomers } from './requests-utils';
import { statusOptions, categoryOptions, PAGE_SIZE_OPTIONS } from './requests-constants';
import { exportServiceRequests } from '@/lib/excel';
import { getErrorMessage, logger } from '@/lib/logger';
import { withTimeout, DATA_FETCH_TIMEOUT_MS, EXCEL_FETCH_TIMEOUT_MS, getTimeoutFriendlyMessage } from '@/lib/timeout';
import { showError, showSuccess } from '@/lib/toast';
import { useServiceRequestMemosRealtime } from '@/lib/realtime';

function RequestsPage({ mode = 'requests' }: { mode?: 'requests' | 'distribution' }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [stats, setStats] = useState({ total: 0, unread: 0, assigned: 0, completed: 0, thisMonth: 0 });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => searchParams?.get('status') ?? '');
  const [categoryFilter, setCategoryFilter] = useState('');
  /** 배정 상태: 'all' 전체, 'assigned' 배정만, 'unassigned' 미배정만 — DB분배 모드 기본값 미배정 */
  const [assignmentFilter, setAssignmentFilter] = useState<'all' | 'assigned' | 'unassigned'>(mode === 'distribution' ? 'unassigned' : 'all');
  const [pageSize, setPageSize] = useState(20);
  const [unassignedByCategory, setUnassignedByCategory] = useState<Record<string, number>>({});
  const [customerDetailModal, setCustomerDetailModal] = useState<CustomerRow | null>(null);
  const [showBulkUnassignModal, setShowBulkUnassignModal] = useState(false);
  const [bulkUnassigning, setBulkUnassigning] = useState(false);
  const [delayedList, setDelayedList] = useState<{ id: string; assigned_at: string; category: string; customer_name?: string; customer_phone?: string }[]>([]);
  const [showDelayedSection, setShowDelayedSection] = useState(false);
  const [loadingDelayed, setLoadingDelayed] = useState(false);


  const [showAssignModal, setShowAssignModal] = useState(false);
  const [assignTarget, setAssignTarget] = useState<RequestRow | null>(null);
  const [availablePartners, setAvailablePartners] = useState<{ id: string; business_name: string; manager_name?: string; manager_phone?: string; avg_rating?: number }[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [showMemoModal, setShowMemoModal] = useState(false);
  const [memoTarget, setMemoTarget] = useState<RequestRow | null>(null);
  const [memoText, setMemoText] = useState('');
  const [savingMemo, setSavingMemo] = useState(false);
  const [unifiedMemos, setUnifiedMemos] = useState<UnifiedMemo[]>([]);
  const [newMemoText, setNewMemoText] = useState('');
  const [loadingMemos, setLoadingMemos] = useState(false);
  const [requestedProduct, setRequestedProduct] = useState('');
  const [customerPaymentAmount, setCustomerPaymentAmount] = useState('');
  const [supportAmount, setSupportAmount] = useState('');
  const [supportAmountPromise, setSupportAmountPromise] = useState('');
  const [realtorCommissionAmount, setRealtorCommissionAmount] = useState('');
  const [realtorCommissionCompleteAmount, setRealtorCommissionCompleteAmount] = useState('');
  const [realtorCommissionMemo, setRealtorCommissionMemo] = useState('');
  const [partnerPaymentRequestAmount, setPartnerPaymentRequestAmount] = useState('');
  const [savingAmounts, setSavingAmounts] = useState(false);
  // 업종별 수익쉐어 기본값 (DB 가격 설정에서 로드)
  const [revenueShareDefaults, setRevenueShareDefaults] = useState<RealtorRevenueShareDefault[]>([]);

  // 일괄 상태변경
  const [bulkStatusValue, setBulkStatusValue] = useState('');
  // 일괄 취소 모달
  const [showBulkCancelModal, setShowBulkCancelModal] = useState(false);
  const [bulkCancelMemo, setBulkCancelMemo] = useState('');
  const [bulkCancelling, setBulkCancelling] = useState(false);

  // 선택 항목 (일괄 배정용)
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // 헤더 체크박스 ref (indeterminate 상태용)
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // 일괄 선택 배정 모달
  const [showBulkSpecificAssignModal, setShowBulkSpecificAssignModal] = useState(false);
  const [bulkSpecificCategoryFilter, setBulkSpecificCategoryFilter] = useState('');
  const [bulkSpecificPartnerId, setBulkSpecificPartnerId] = useState('');
  const [bulkSpecificPartners, setBulkSpecificPartners] = useState<{ id: string; business_name: string; manager_name?: string; manager_phone?: string; avg_rating?: number }[]>([]);
  const [bulkSpecificAssigning, setBulkSpecificAssigning] = useState(false);

  // 제휴업체 상태 변경 (취소 사유 모달)
  const [partnerCancelModal, setPartnerCancelModal] = useState<{ requestId: string } | null>(null);
  const [partnerCancelReason, setPartnerCancelReason] = useState<string>('');
  const [partnerCancelDetail, setPartnerCancelDetail] = useState('');
  const [reservedDateModal, setReservedDateModal] = useState<{ requestId: string } | null>(null);
  const [reservedDate, setReservedDate] = useState('');
  const [reservedPrice, setReservedPrice] = useState('');
  const [reservedSubsidyAmount, setReservedSubsidyAmount] = useState('');
  const [reservedSubsidyDate, setReservedSubsidyDate] = useState('');
  const [updatingPartnerStatus, setUpdatingPartnerStatus] = useState(false);

  const [statusHistory, setStatusHistory] = useState<Record<string, StatusHistoryEntry[]>>({});
  const [memoCounts, setMemoCounts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excelDownloading, setExcelDownloading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      // 목록 조회는 반드시 성공해야 하므로 단독 withTimeout 처리
      const result = await withTimeout(
        getCustomersWithRequests({
          search: searchTerm || undefined,
          status: statusFilter as HqStatus || undefined,
          category: categoryFilter as ServiceCategory || undefined,
          assignmentFilter: assignmentFilter !== 'all' ? assignmentFilter : undefined,
          page,
          limit: pageSize,
        }),
        DATA_FETCH_TIMEOUT_MS
      );

      const customers = result.data || [];
      setCustomers(customers);
      setTotal(result.total);
      setTotalPages(result.totalPages);

      // 통계·미배정 건수는 실패해도 목록 표시에 영향 없도록 allSettled 처리
      const [statsResult, unassignedResult] = await Promise.allSettled([
        getServiceRequestStats(),
        getUnassignedCountByCategory(),
      ]);
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      }
      const unassignedCounts = unassignedResult.status === 'fulfilled' ? unassignedResult.value : {};
      setUnassignedByCategory(unassignedCounts);

      // 상태 이력 + 메모 @카운트 배치 로드
      const srIds: string[] = customers.flatMap((c: CustomerRow) => normalizeServiceRequests(c.service_requests).map((r: RequestRow) => r.id));
      const paIds: string[] = customers.flatMap((c: CustomerRow) =>
        normalizeServiceRequests(c.service_requests).flatMap((r: RequestRow) => {
          const pa = Array.isArray(r.partner_assignment) ? r.partner_assignment : (r.partner_assignment ? [r.partner_assignment] : []);
          return pa.map((p) => p.id);
        })
      );
      try {
        const [history, counts] = await Promise.all([
          getBatchStatusHistory([...srIds, ...paIds]),
          getBatchMemoCounts(srIds),
        ]);
        setStatusHistory(history);
        setMemoCounts(counts);
      } catch {
        showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      }
    } catch (err) {
      logger.error('데이터 로드 오류', err);
      const timeoutMsg = getTimeoutFriendlyMessage(err);
      const rawMsg = getErrorMessage(err);
      const friendly = timeoutMsg || rawMsg;
      setLoadError(rawMsg === 'Supabase가 설정되지 않았습니다.' ? 'Supabase 환경변수를 확인해 주세요.' : friendly);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, categoryFilter, assignmentFilter, page, pageSize]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 수익쉐어 기본값은 앱 마운트 시 1회 로드 (가격 설정 변경은 페이지 새로고침으로 반영)
  useEffect(() => {
    getRealtorRevenueShareDefaults()
      .then(setRevenueShareDefaults)
      .catch(() => {
        showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      });
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { setPage(1); setSelectedIds([]); }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 헤더 체크박스 indeterminate 상태 동기화
  const currentPageRequestIds = getRequestIdsFromCustomers(customers);
  useEffect(() => {
    if (!headerCheckboxRef.current) return;
    const selectedOnPage = currentPageRequestIds.filter(id => selectedIds.includes(id));
    if (selectedOnPage.length === 0) {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = false;
    } else if (selectedOnPage.length === currentPageRequestIds.length) {
      headerCheckboxRef.current.checked = true;
      headerCheckboxRef.current.indeterminate = false;
    } else {
      headerCheckboxRef.current.checked = false;
      headerCheckboxRef.current.indeterminate = true;
    }
  }, [selectedIds, currentPageRequestIds]);

  // 일괄 선택 배정 모달: 카테고리 변경 시 업체 목록 로드
  useEffect(() => {
    if (!showBulkSpecificAssignModal) return;
    setBulkSpecificPartnerId('');
    if (bulkSpecificCategoryFilter) {
      getPartnersByCategory(bulkSpecificCategoryFilter as import('@/types/database').ServiceCategory)
        .then(data => setBulkSpecificPartners((data ?? []) as { id: string; business_name: string; manager_name?: string; manager_phone?: string; avg_rating?: number }[]))
        .catch(() => {
          setBulkSpecificPartners([]);
          showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
        });
    } else {
      getPartners({ limit: 200 })
        .then(res => setBulkSpecificPartners(res.data.map(p => ({ id: p.id, business_name: p.business_name, manager_name: p.manager_name ?? undefined, manager_phone: p.manager_phone ?? undefined, avg_rating: p.avg_rating ?? undefined }))))
        .catch(() => {
          setBulkSpecificPartners([]);
          showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
        });
    }
  }, [showBulkSpecificAssignModal, bulkSpecificCategoryFilter]);

  // 메모 모달 열릴 때 통합 메모 목록 로드
  useEffect(() => {
    if (!showMemoModal || !memoTarget) return;
    setLoadingMemos(true);
    listMemosForServiceRequest(memoTarget.id)
      .then(setUnifiedMemos)
      .catch(() => {
        setUnifiedMemos([]);
        showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      })
      .finally(() => setLoadingMemos(false));
  }, [showMemoModal, memoTarget]);

  // 통합 메모 실시간 구독 — 본사·제휴업체가 메모 추가 시 목록·확인요청 카운트 갱신
  const refetchMemosAndCount = useCallback(() => {
    if (!memoTarget) return;
    listMemosForServiceRequest(memoTarget.id)
      .then(setUnifiedMemos)
      .catch(() => {
        setUnifiedMemos([]);
        showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      });
    getBatchMemoCounts([memoTarget.id])
      .then((counts) => {
        setMemoCounts((prev) => ({ ...prev, ...counts }));
      })
      .catch(() => {
        showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      });
  }, [memoTarget]);
  useServiceRequestMemosRealtime(showMemoModal && memoTarget ? memoTarget.id : null, refetchMemosAndCount);

  const openAssignModal = async (request: RequestRow) => {
    setAssignTarget(request);
    setSelectedPartnerId('');
    setShowAssignModal(true);
    try {
      const partners = await getPartnersByCategory(request.category);
      setAvailablePartners(partners ?? []);
    } catch {
      setAvailablePartners([]);
      showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
    }
  };

  const handlePartnerStatusChange = async (
    requestId: string,
    status: string,
    extra?: {
      installation_date?: string;
      cancel_reason?: string;
      cancel_reason_detail?: string;
      reserved_price?: number | null;
      subsidy_amount?: number | null;
      subsidy_payment_date?: string | null;
    }
  ) => {
    if (status === 'cancelled' && !extra?.cancel_reason) {
      setPartnerCancelModal({ requestId });
      return;
    }
    if (status === 'reserved' && !extra?.installation_date) {
      setReservedDateModal({ requestId });
      setReservedDate('');
      setReservedPrice('');
      setReservedSubsidyAmount('');
      setReservedSubsidyDate('');
      return;
    }
    setUpdatingPartnerStatus(true);
    try {
      await updatePartnerAssignmentStatus(requestId, {
        status: status as PartnerStatus,
        installation_date: extra?.installation_date ?? undefined,
        cancel_reason: (extra?.cancel_reason as PartnerCancelReason | undefined) ?? undefined,
        cancel_reason_detail: extra?.cancel_reason_detail ?? undefined,
        reserved_price: extra?.reserved_price ?? undefined,
        subsidy_amount: extra?.subsidy_amount ?? undefined,
        subsidy_payment_date: extra?.subsidy_payment_date ?? undefined,
      });
      if (extra?.cancel_reason === 'partner_issue') {
        showSuccess('본 업체 사정으로 취소 → 배정 전 상태로 복귀되었습니다.');
      }
      loadData();
      setPartnerCancelModal(null);
      setReservedDateModal(null);
      setPartnerCancelReason('');
      setPartnerCancelDetail('');
    } catch (e) {
      showError('변경 실패: ' + getErrorMessage(e));
    } finally {
      setUpdatingPartnerStatus(false);
    }
  };

  const confirmPartnerCancel = () => {
    if (!partnerCancelModal || !partnerCancelReason) {
      showError('취소 사유를 선택해주세요.');
      return;
    }
    handlePartnerStatusChange(partnerCancelModal.requestId, 'cancelled', {
      cancel_reason: partnerCancelReason,
      cancel_reason_detail: partnerCancelDetail || undefined,
    });
  };

  const confirmReservedDate = () => {
    if (!reservedDateModal || !reservedDate) {
      showError('예약일을 입력해주세요.');
      return;
    }
    handlePartnerStatusChange(reservedDateModal.requestId, 'reserved', {
      installation_date: reservedDate,
      reserved_price: reservedPrice ? Number(reservedPrice) : null,
      subsidy_amount: reservedSubsidyAmount ? Number(reservedSubsidyAmount) : null,
      subsidy_payment_date: reservedSubsidyDate || null,
    });
  };

  const handleExcelDownload = async () => {
    if (excelDownloading) return;
    setExcelDownloading(true);
    try {
      const result = await withTimeout(
        getCustomersWithRequests({
          search: searchTerm || undefined,
          status: statusFilter as HqStatus || undefined,
          category: categoryFilter as ServiceCategory || undefined,
          assignmentFilter: assignmentFilter !== 'all' ? assignmentFilter : undefined,
          page: 1,
          limit: 9999,
        }),
        EXCEL_FETCH_TIMEOUT_MS
      );
      const data = result?.data ?? [];
      const list: any[] = [];
      data.forEach((c: CustomerRow) => {
        const requests = normalizeServiceRequests(c.service_requests);
        const sourceRealtor = c.source_realtor != null
          ? (Array.isArray(c.source_realtor) ? (c.source_realtor as any[])[0] : c.source_realtor)
          : null;
        requests.forEach((req: RequestRow) => {
          const assignedPartner = req.assigned_partner != null
            ? (Array.isArray(req.assigned_partner) ? (req.assigned_partner as any[])[0] : req.assigned_partner)
            : null;
          list.push({
            id: req.id,
            category: req.category,
            hq_status: req.hq_status,
            created_at: req.created_at,
            customer: {
              name: c.name,
              phone: c.phone,
              moving_date: c.moving_date,
              moving_address: c.moving_address,
              source_realtor: sourceRealtor,
            },
            assigned_partner: assignedPartner,
          });
        });
      });
      if (list.length === 0) {
        showError('다운로드할 데이터가 없습니다.');
        return;
      }
      try {
        await exportServiceRequests(list);
      } catch (excelErr) {
        logger.error('엑셀(xlsx) 생성 실패, CSV 대체 다운로드 시도', excelErr);
        showError('엑셀(xlsx) 생성에 실패하여 CSV로 다운로드되었습니다.');
        const categoryLabels: Record<string, string> = { moving: '이사', cleaning: '청소', internet_tv: '인터넷/TV', interior: '인테리어', appliance_rental: '가전렌탈', kiosk: '무인택배' };
        const statusLabels: Record<string, string> = { unread: '미배정', read: '열람', assigned: '배정완료', settlement_check: '정산확인', settlement_done: '정산완료', hq_review_needed: '본사확인필요', cancelled: '취소' };
        const header = ['고객명', '연락처', '카테고리', '상태', '배정업체', '이사일', '이사주소', '출처', '신청일'];
        const rows = list.map((r: any) => [
          r.customer?.name ?? '-', r.customer?.phone ?? '-',
          categoryLabels[r.category] ?? r.category ?? '-', statusLabels[r.hq_status] ?? r.hq_status ?? '-',
          r.assigned_partner?.business_name ?? '-', r.customer?.moving_date ? new Date(r.customer.moving_date).toLocaleDateString('ko-KR') : '-',
          r.customer?.moving_address ?? '-', r.customer?.source_realtor?.business_name ?? '-',
          r.created_at ? new Date(r.created_at).toLocaleDateString('ko-KR') : '-',
        ]);
        const csvContent = '\uFEFF' + [header, ...rows].map(row => row.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `서비스요청_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
      showSuccess('다운로드되었습니다.');
    } catch (err) {
      logger.error('서비스 요청 엑셀 다운로드 오류', err);
      const msg = getTimeoutFriendlyMessage(err) || getErrorMessage(err);
      showError(msg || '다운로드 중 오류가 발생했습니다.');
    } finally {
      setExcelDownloading(false);
    }
  };

  // 수동 배정
  const handleAssign = async () => {
    if (!selectedPartnerId || !assignTarget || !user) return;

    setAssigning(true);
    try {
      await assignPartner(assignTarget.id, selectedPartnerId, user.id);
      // SMS/알림톡은 assignPartner 내부에서 자동 발송됨
      showSuccess('배정이 완료되었습니다.');
      setShowAssignModal(false);
      loadData();
    } catch (e) {
      showError('배정 실패: ' + getErrorMessage(e));
    } finally {
      setAssigning(false);
    }
  };

  const handleRandomAssign = async () => {
    if (!assignTarget || !user) return;

    setAssigning(true);
    try {
      const partner = await assignRandomPartner(assignTarget.id, assignTarget.category, user.id);
      // SMS/알림톡은 assignPartner 내부에서 자동 발송됨
      showSuccess(`'${partner.business_name}'에 배정되었습니다.`);
      setShowAssignModal(false);
      loadData();
    } catch (e) {
      showError('랜덤 배정 실패: ' + getErrorMessage(e));
    } finally {
      setAssigning(false);
    }
  };

  const handleBulkAssign = async () => {
    if (selectedIds.length === 0 || !user) return;
    if (!confirm(`${selectedIds.length}건을 랜덤 배정하시겠습니까?`)) return;

    try {
      const results = await bulkAssignPartners(selectedIds, user.id, 'random');
      const successIds = results.filter(r => r.success).map(r => r.requestId);
      const failCount = results.filter(r => !r.success).length;
      showSuccess(`성공: ${successIds.length}건, 실패: ${failCount}건`);
      setSelectedIds([]);
      loadData();
      // SMS/알림톡은 각 assignPartner 내부에서 자동 발송됨
    } catch (e) {
      showError('일괄 배정 실패: ' + getErrorMessage(e));
    }
  };

  const openBulkSpecificAssignModal = () => {
    // 선택된 항목들의 카테고리를 분석해 기본값 설정
    const cats = new Set<string>();
    customers.forEach((c: CustomerRow) => normalizeServiceRequests(c.service_requests).forEach((r: RequestRow) => {
      if (selectedIds.includes(r.id)) cats.add(r.category);
    }));
    setBulkSpecificCategoryFilter(cats.size === 1 ? Array.from(cats)[0] : '');
    setBulkSpecificPartnerId('');
    setBulkSpecificPartners([]);
    setShowBulkSpecificAssignModal(true);
  };

  const handleBulkSpecificAssign = async () => {
    if (selectedIds.length === 0 || !bulkSpecificPartnerId || !user) return;
    const partnerName = bulkSpecificPartners.find(p => p.id === bulkSpecificPartnerId)?.business_name ?? '';
    if (!confirm(`선택한 ${selectedIds.length}건을 '${partnerName}' 업체에 배정하시겠습니까?`)) return;
    setBulkSpecificAssigning(true);
    try {
      const results = await bulkAssignPartners(selectedIds, user.id, 'specific', bulkSpecificPartnerId);
      const successIds = results.filter(r => r.success).map(r => r.requestId);
      const failCount = results.filter(r => !r.success).length;
      showSuccess(`배정 완료: 성공 ${successIds.length}건${failCount > 0 ? `, 실패 ${failCount}건` : ''}`);
      setSelectedIds([]);
      setShowBulkSpecificAssignModal(false);
      loadData();
      // SMS/알림톡은 각 assignPartner 내부에서 자동 발송됨
    } catch (e) {
      showError('일괄 배정 실패: ' + getErrorMessage(e));
    } finally {
      setBulkSpecificAssigning(false);
    }
  };

  const handleSaveMemo = async () => {
    if (!memoTarget) return;
    setSavingMemo(true);
    try {
      await updateServiceRequestMemo(memoTarget.id, memoText);
      showSuccess('본사 메모가 저장되었습니다.');
      loadData();
    } catch (e) {
      showError('메모 저장 실패: ' + getErrorMessage(e));
    } finally {
      setSavingMemo(false);
    }
  };

  const handleAddUnifiedMemo = async () => {
    if (!memoTarget || !newMemoText.trim() || !user) return;
    setSavingMemo(true);
    try {
      await addServiceRequestMemo(memoTarget.id, newMemoText.trim(), user.id);
      const list = await listMemosForServiceRequest(memoTarget.id);
      setUnifiedMemos(list);
      setNewMemoText('');
      showSuccess('메모가 추가되었습니다.');
    } catch (e) {
      showError('메모 추가 실패: ' + getErrorMessage(e));
    } finally {
      setSavingMemo(false);
    }
  };

  const handleSaveRequestedProduct = async () => {
    if (!memoTarget) return;
    setSavingAmounts(true);
    try {
      await updateServiceRequestRequestedProduct(memoTarget.id, requestedProduct.trim() || null);
      showSuccess('신청상품이 저장되었습니다.');
      loadData();
    } catch (e) {
      showError('저장 실패: ' + getErrorMessage(e));
    } finally {
      setSavingAmounts(false);
    }
  };

  const handleSaveAmounts = async () => {
    if (!memoTarget) return;
    setSavingAmounts(true);
    try {
      await updatePartnerAssignmentAmounts(memoTarget.id, {
        customer_payment_amount: customerPaymentAmount ? Number(customerPaymentAmount) : null,
        support_amount: supportAmount ? Number(supportAmount) : null,
        support_amount_promise: supportAmountPromise.trim() || null,
        realtor_commission_amount: realtorCommissionAmount ? Number(realtorCommissionAmount) : null,
        realtor_commission_complete_amount: realtorCommissionCompleteAmount ? Number(realtorCommissionCompleteAmount) : null,
        realtor_commission_memo: realtorCommissionMemo.trim() || null,
        partner_payment_request_amount: partnerPaymentRequestAmount ? Number(partnerPaymentRequestAmount) : null,
      });
      showSuccess('금액 정보가 저장되었습니다.');
      loadData();
    } catch (e) {
      showError('저장 실패: ' + getErrorMessage(e));
    } finally {
      setSavingAmounts(false);
    }
  };

  const handleStatusChange = async (requestId: string, newStatus: HqStatus) => {
    try {
      await updateServiceRequestStatus(requestId, newStatus);
      loadData();
    } catch (e) {
      showError('상태 변경 실패: ' + getErrorMessage(e));
    }
  };

  const handleBulkStatusChange = async () => {
    if (selectedIds.length === 0 || !bulkStatusValue) return;
    // 취소 상태는 전용 모달로 처리 (사유 메모 입력 필요)
    if (bulkStatusValue === 'cancelled') {
      setBulkCancelMemo('');
      setShowBulkCancelModal(true);
      return;
    }
    if (!confirm(`선택한 ${selectedIds.length}건의 상태를 '${statusOptions.find(o => o.value === bulkStatusValue)?.label}'으로 변경하시겠습니까?`)) return;
    try {
      await Promise.all(selectedIds.map((id) => updateServiceRequestStatus(id, bulkStatusValue as HqStatus)));
      showSuccess(`${selectedIds.length}건 상태 변경 완료`);
      setSelectedIds([]);
      setBulkStatusValue('');
      loadData();
    } catch (e) {
      showError('일괄 상태변경 실패: ' + getErrorMessage(e));
    }
  };

  const handleBulkCancelConfirm = async () => {
    if (selectedIds.length === 0) return;
    setBulkCancelling(true);
    try {
      await Promise.all(
        selectedIds.map(async (id) => {
          await updateServiceRequestStatus(id, 'cancelled' as HqStatus);
          if (bulkCancelMemo.trim()) {
            await updateServiceRequestMemo(id, bulkCancelMemo.trim());
          }
        })
      );
      showSuccess(`${selectedIds.length}건 취소 처리 완료`);
      setSelectedIds([]);
      setBulkStatusValue('');
      setBulkCancelMemo('');
      setShowBulkCancelModal(false);
      loadData();
    } catch (e) {
      showError('일괄 취소 실패: ' + getErrorMessage(e));
    } finally {
      setBulkCancelling(false);
    }
  };

  const handleBulkUnassign = async () => {
    if (selectedIds.length === 0 || !showBulkUnassignModal) return;
    setBulkUnassigning(true);
    try {
      const { success, skipped, errors } = await bulkUnassignAssignments(selectedIds, { sameDayOnly: true });
      if (errors.length > 0) {
        showError(`${success}건 취소, ${errors.length}건 실패: ${errors[0]?.message ?? ''}`);
      } else {
        showSuccess(`배정 취소 완료: ${success}건${skipped > 0 ? ` (당일 외 ${skipped}건 제외)` : ''}`);
      }
      setShowBulkUnassignModal(false);
      setSelectedIds([]);
      loadData();
    } catch (e) {
      showError('일괄 배정 취소 실패: ' + getErrorMessage(e));
    } finally {
      setBulkUnassigning(false);
    }
  };

  const loadDelayedList = async () => {
    setLoadingDelayed(true);
    try {
      const list = await getDelayedAssignments();
      setDelayedList(list);
      setShowDelayedSection(true);
    } catch (e) {
      showError('지연 DB 목록 로드 실패: ' + getErrorMessage(e));
    } finally {
      setLoadingDelayed(false);
    }
  };

  const handleUnassignDelayed = async (serviceRequestId: string) => {
    try {
      const res = await fetch('/api/requests/unassign-delayed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceRequestId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data?.error ?? '배정 해제 실패');
        return;
      }
      showSuccess('배정이 해제되어 미배정 상태로 전환되었습니다. (업체에 확인 안내 발송)');
      setDelayedList((prev) => prev.filter((r) => r.id !== serviceRequestId));
      loadData();
    } catch (e) {
      showError('배정 해제 실패: ' + getErrorMessage(e));
    }
  };

  const selectedAssignedCount = selectedIds.filter((id) => {
    for (const c of customers) {
      const serviceRequests = Array.isArray(c.service_requests)
        ? c.service_requests
        : c.service_requests
          ? [c.service_requests]
          : [];
      for (const r of serviceRequests) {
        if (r.id === id && r.assigned_partner_id) return true;
      }
    }
    return false;
  }).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 선택 시 상단 고정 일괄 액션 바 — 스크롤해도 항상 노출 */}
        {selectedIds.length > 0 && (
          <div className="sticky top-0 z-30 flex flex-wrap items-center gap-2 py-3 px-3 sm:px-4 rounded-xl bg-primary-600 text-white shadow-lg border border-primary-700 min-w-0">
            <span className="font-semibold whitespace-nowrap flex items-center gap-1.5">
              <CheckSquare className="h-4 w-4" />
              {selectedIds.length}건 선택 중 · 페이지 넘어가도 유지
            </span>
            <div className="flex flex-wrap items-center gap-2 ml-2">
              <Button type="button" variant="secondary" size="sm" className="!bg-white/90 !text-primary-800 hover:!bg-white" onClick={handleBulkAssign}>
                <Shuffle className="h-3.5 w-3.5 mr-1.5" />
                일괄 랜덤 배정
              </Button>
              <Button type="button" variant="secondary" size="sm" className="!bg-white/90 !text-primary-800 hover:!bg-white" onClick={openBulkSpecificAssignModal}>
                <UserPlus className="h-3.5 w-3.5 mr-1.5" />
                일괄 선택 배정
              </Button>
              <select
                value={bulkStatusValue}
                onChange={(e) => setBulkStatusValue(e.target.value)}
                className="!bg-white/90 !text-gray-800 py-1.5 text-sm w-28 rounded border-0"
              >
                <option value="">상태 선택</option>
                {statusOptions.filter(o => o.value).map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <Button type="button" variant="secondary" size="sm" className="!bg-white/90 !text-primary-800 hover:!bg-white" onClick={handleBulkStatusChange} disabled={!bulkStatusValue}>
                일괄 상태변경
              </Button>
              {selectedAssignedCount > 0 && (
                <Button type="button" variant="secondary" size="sm" className="!bg-amber-100 !text-amber-900 hover:!bg-amber-200" onClick={() => setShowBulkUnassignModal(true)}>
                  선택 건 배정 취소
                </Button>
              )}
              <Button type="button" variant="secondary" size="sm" className="!bg-white/20 !text-white hover:!bg-white/30" onClick={() => setSelectedIds([])}>
                <X className="h-3.5 w-3.5 mr-1.5" />
                선택 해제
              </Button>
            </div>
          </div>
        )}

        {/* 헤더 — 스티키 카드(z-25)보다 위에 두어 버튼이 가려지지 않도록 */}
        <div className="flex flex-col gap-4 mb-6 relative z-30 pointer-events-auto bg-white/95 backdrop-blur-sm -mx-1 px-1 py-1 rounded-lg">
          <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-between sm:items-start gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl md:text-2xl font-bold text-gray-900">
                {mode === 'distribution' ? 'DB 분배' : '서비스요청(DB) 관리'}
              </h1>
              <p className="mt-1 text-sm text-gray-500">
                {mode === 'distribution'
                  ? `미배정 ${stats.unread}건 · 전체 ${stats.total}건 — 미배정 DB를 제휴업체에 배정합니다`
                  : `총 ${stats.total}건 · 미배정 ${stats.unread}건 · 배정완료 ${stats.assigned}건 · 이번달 ${stats.thisMonth}건`}
              </p>
            </div>
            {/* 타이틀 영역 검색창 — 고객명, 전화번호 검색 */}
            <div className="w-full sm:w-64 md:w-72 lg:w-80 shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="고객명, 전화번호 검색"
                  className="input pl-9 w-full min-h-[2.5rem] text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  aria-label="고객명 또는 전화번호로 검색"
                />
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3 items-center mt-2 sm:mt-0 min-w-0">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <span>페이지</span>
              <select
                value={pageSize}
                onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                className="input w-20 py-1.5"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>{n}건</option>
                ))}
              </select>
            </label>
            <Button variant="secondary" size="sm" onClick={loadDelayedList} disabled={loadingDelayed}>
              {loadingDelayed ? '로딩...' : '지연 DB (24h)'}
            </Button>
            <Button variant="secondary" onClick={handleExcelDownload} disabled={excelDownloading}>
              <Download className={`h-4 w-4 mr-2 ${excelDownloading ? 'animate-pulse' : ''}`} />
              {excelDownloading ? '다운로드 중...' : '엑셀 다운로드'}
            </Button>
            {/* 일괄 배정·일괄 상태변경 — 항상 표시(선택 시에만 활성화) */}
            <>
              <span className="text-xs text-gray-500 mr-1">전체 선택:</span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const ids = getRequestIdsFromCustomers(customers);
                  setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
                }}
                title="현재 페이지 전체를 선택에 추가"
              >
                현재 페이지
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    const res = await getCustomersWithRequests({
                      search: searchTerm || undefined,
                      status: statusFilter as HqStatus || undefined,
                      category: categoryFilter as ServiceCategory || undefined,
                      assignmentFilter: assignmentFilter !== 'all' ? assignmentFilter : undefined,
                      page: 1,
                      limit: 9999,
                    });
                    const allIds = getRequestIdsFromCustomers((res.data || []) as CustomerRow[]);
                    setSelectedIds(allIds);
                  } catch (e) {
                    showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
                  }
                }}
                title="필터 결과 전체 선택 · 페이지 넘어가도 유지"
              >
                필터 전체 ({total}건)
              </Button>
              <div className="flex items-center gap-1 bg-primary-50 border border-primary-200 rounded-lg px-3 py-1.5 text-sm font-medium min-w-[7rem] justify-center">
                <CheckSquare className="h-4 w-4" />
                <span className={selectedIds.length > 0 ? 'text-primary-700' : 'text-gray-500'}>
                  {selectedIds.length > 0 ? `${selectedIds.length}건 선택` : '0건 선택'}
                </span>
                {selectedIds.length > 0 && (
                  <span className="text-primary-400 text-xs ml-1 hidden sm:inline">(페이지 이동 후에도 유지)</span>
                )}
              </div>
              <Button type="button" variant="primary" onClick={handleBulkAssign} disabled={selectedIds.length === 0} title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}>
                <Shuffle className="h-4 w-4 mr-2" />
                일괄 랜덤 배정
              </Button>
              <Button type="button" variant="secondary" onClick={openBulkSpecificAssignModal} disabled={selectedIds.length === 0} title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}>
                <UserPlus className="h-4 w-4 mr-2" />
                일괄 선택 배정
              </Button>
              {selectedAssignedCount > 0 && (
                <Button type="button" variant="secondary" onClick={() => setShowBulkUnassignModal(true)}>
                  선택 건 배정 취소
                </Button>
              )}
              <div className="flex items-center gap-1">
                <select
                  value={bulkStatusValue}
                  onChange={(e) => setBulkStatusValue(e.target.value)}
                  className="input py-1.5 text-sm w-32"
                  title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}
                >
                  <option value="">상태 선택</option>
                  {statusOptions.filter(o => o.value).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleBulkStatusChange}
                  disabled={selectedIds.length === 0 || !bulkStatusValue}
                  title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}
                >
                  일괄 상태변경
                </Button>
              </div>
              {selectedIds.length > 0 && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setSelectedIds([])}
                  className="text-gray-500"
                >
                  <X className="h-4 w-4 mr-1" />
                  선택 해제
                </Button>
              )}
            </>
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        </div>

        {/* 미배정 카테고리별 수량 (클릭 시 해당 카테고리 + 미배정만 필터) */}
        {Object.keys(unassignedByCategory).length > 0 && (
          <Card>
            <CardBody className="py-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-gray-700">미배정 DB (카테고리별)</span>
                {Object.entries(unassignedByCategory).map(([cat, count]) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setCategoryFilter(cat);
                      setAssignmentFilter('unassigned');
                      setPage(1);
                      setSelectedIds([]);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-primary-50 text-primary-700 text-sm font-medium hover:bg-primary-100"
                  >
                    {SERVICE_CATEGORY_LABELS[cat] ?? cat}: {count}건
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* 지연 DB 섹션 */}
        {showDelayedSection && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <h2 className="text-lg font-semibold text-amber-800">지연 DB (배정 후 24시간 경과)</h2>
              <button type="button" onClick={() => setShowDelayedSection(false)} className="text-gray-500 hover:text-gray-700">
                <X className="h-5 w-5" />
              </button>
            </CardHeader>
            <CardBody>
              {delayedList.length === 0 ? (
                <p className="text-sm text-gray-500">지연 DB가 없습니다.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="data-table text-sm">
                    <thead>
                      <tr>
                        <th>고객</th>
                        <th>연락처</th>
                        <th>카테고리</th>
                        <th>배정일시</th>
                        <th className="w-28">액션</th>
                      </tr>
                    </thead>
                    <tbody>
                      {delayedList.map((row) => (
                        <tr key={row.id}>
                          <td>{row.customer_name ?? '-'}</td>
                          <td>{row.customer_phone ?? '-'}</td>
                          <td>{SERVICE_CATEGORY_LABELS[row.category] ?? row.category}</td>
                          <td>{row.assigned_at ? new Date(row.assigned_at).toLocaleString('ko-KR') : '-'}</td>
                          <td>
                            <Button size="sm" variant="secondary" onClick={() => handleUnassignDelayed(row.id)}>
                              배정 해제
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* 일괄 작업 (운영 핵심) — 스크롤해도 엑셀/새로고침/지연 DB + 일괄 배정 항상 클릭 가능 */}
        <Card className="border-primary-200 bg-primary-50/40 sticky top-[4.5rem] z-[25] shadow-md overflow-visible pointer-events-auto isolate">
          <CardBody className="py-3 sm:py-4 pointer-events-auto">
            <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-3 sm:gap-4 relative pointer-events-auto min-w-0">
              <div className="flex items-center gap-2 font-medium text-gray-800 shrink-0">
                <ListChecks className="h-5 w-5 text-primary-600" />
                <span>일괄 작업</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:border-r sm:border-primary-200 sm:pr-3 min-w-0">
                <Button type="button" variant="secondary" size="sm" onClick={loadDelayedList} disabled={loadingDelayed}>
                  {loadingDelayed ? '로딩...' : '지연 DB (24h)'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={handleExcelDownload} disabled={excelDownloading}>
                  <Download className={`h-4 w-4 mr-1 ${excelDownloading ? 'animate-pulse' : ''}`} />
                  {excelDownloading ? '다운로드 중...' : '엑셀 다운로드'}
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={loadData} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                  새로고침
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-600">전체 선택:</span>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const ids = getRequestIdsFromCustomers(customers);
                    setSelectedIds(prev => Array.from(new Set([...prev, ...ids])));
                  }}
                >
                  현재 페이지 ({currentPageRequestIds.length}건)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                onClick={async () => {
                  try {
                    const res = await getCustomersWithRequests({
                      search: searchTerm || undefined,
                      status: statusFilter as HqStatus || undefined,
                      category: categoryFilter as ServiceCategory || undefined,
                      assignmentFilter: assignmentFilter !== 'all' ? assignmentFilter : undefined,
                      page: 1,
                      limit: 9999,
                    });
                    const allIds = getRequestIdsFromCustomers((res.data || []) as CustomerRow[]);
                    setSelectedIds(allIds);
                  } catch (e) {
                    showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
                  }
                }}
                >
                  필터 결과 전체 ({total}건) · 페이지 넘어가도 유지
                </Button>
                {selectedIds.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary-700 bg-primary-100 border border-primary-200 rounded-full px-3 py-1">
                    <CheckSquare className="h-3.5 w-3.5" />
                    {selectedIds.length}건 선택 중
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 ml-auto">
                <Button type="button" variant="primary" onClick={handleBulkAssign} disabled={selectedIds.length === 0} title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}>
                  <Shuffle className="h-4 w-4 mr-2" />
                  일괄 랜덤 배정
                </Button>
                <Button type="button" variant="secondary" onClick={openBulkSpecificAssignModal} disabled={selectedIds.length === 0} title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  일괄 선택 배정
                </Button>
                <select
                  value={bulkStatusValue}
                  onChange={(e) => setBulkStatusValue(e.target.value)}
                  className="input py-1.5 text-sm w-32"
                  title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}
                >
                  <option value="">상태 선택</option>
                  {statusOptions.filter(o => o.value).map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleBulkStatusChange}
                  disabled={selectedIds.length === 0 || !bulkStatusValue}
                  title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}
                >
                  일괄 상태변경
                </Button>
                {selectedAssignedCount > 0 && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowBulkUnassignModal(true)}>
                    선택 건 배정 취소
                  </Button>
                )}
                {selectedIds.length > 0 && (
                  <Button type="button" variant="secondary" size="sm" onClick={() => setSelectedIds([])} className="text-gray-500">
                    <X className="h-4 w-4 mr-1" />
                    선택 해제
                  </Button>
                )}
                {mode === 'distribution' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      if (!user) return;
                      if (!confirm('미배정 DB 전체를 랜덤 배정하시겠습니까?')) return;
                      try {
                        const res = await getCustomersWithRequests({
                          assignmentFilter: 'unassigned',
                          page: 1,
                          limit: 9999,
                        });
                        const unassignedIds: string[] = [];
                        (res.data || []).forEach((c: CustomerRow) => normalizeServiceRequests(c.service_requests).forEach((r: RequestRow) => {
                          if (!r.assigned_partner_id) unassignedIds.push(r.id);
                        }));
                        if (unassignedIds.length === 0) { showError('미배정 DB가 없습니다.'); return; }
                        const results = await bulkAssignPartners(unassignedIds, user.id, 'random');
                        const successCount = results.filter(r => r.success).length;
                        const failCount = results.filter(r => !r.success).length;
                        showSuccess(`미배정 DB 배정 완료: 성공 ${successCount}건, 실패 ${failCount}건`);
                        setSelectedIds([]);
                        loadData();
                      } catch (e) {
                        showError('미배정 DB 배정 실패: ' + getErrorMessage(e));
                      }
                    }}
                  >
                    <UserPlus className="h-4 w-4 mr-1" />
                    미배정 DB 전체 배정
                  </Button>
                )}
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              미배정만 보기 → 필터 결과 전체 선택 → 일괄 랜덤 배정으로 한 번에 배정 가능. 테이블 헤더 체크박스는 현재 페이지만 선택/해제.
            </p>
          </CardBody>
        </Card>

        {/* 필터 — 엑셀 스타일 드롭다운 (배정 상태, 상담 항목, 본사 상태) */}
        <Card>
          <CardBody className="py-3 sm:py-4">
            <div className="flex flex-col gap-3 sm:gap-4">
              <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
                <span className="text-sm font-medium text-gray-700 w-full sm:w-auto">필터</span>
                <div className="flex flex-wrap gap-2 sm:gap-3 items-center min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label htmlFor="filter-assignment" className="text-xs text-gray-500 shrink-0 whitespace-nowrap">배정 상태</label>
                    <select
                      id="filter-assignment"
                      className="input py-2 px-3 min-w-[6.5rem] sm:min-w-[7rem] text-sm touch-manipulation"
                      value={assignmentFilter}
                      onChange={(e) => { setAssignmentFilter(e.target.value as 'all' | 'assigned' | 'unassigned'); setPage(1); setSelectedIds([]); }}
                      title="배정/미배정 필터"
                    >
                      <option value="all">전체</option>
                      <option value="assigned">배정</option>
                      <option value="unassigned">미배정</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label htmlFor="filter-category" className="text-xs text-gray-500 shrink-0 whitespace-nowrap">상담 항목</label>
                    <select
                      id="filter-category"
                      className="input py-2 px-3 min-w-[6.5rem] sm:min-w-[8rem] text-sm touch-manipulation"
                      value={categoryFilter}
                      onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); setSelectedIds([]); }}
                      title="이사, 청소 등 상담 카테고리"
                    >
                      {categoryOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label htmlFor="filter-status" className="text-xs text-gray-500 shrink-0 whitespace-nowrap">본사 상태</label>
                    <select
                      id="filter-status"
                      className="input py-2 px-3 min-w-[6.5rem] sm:min-w-[7.5rem] text-sm touch-manipulation"
                      value={statusFilter}
                      onChange={(e) => { setStatusFilter(e.target.value); setPage(1); setSelectedIds([]); }}
                      title="본사 진행 상태별 필터"
                    >
                      {statusOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <p className="text-xs text-gray-500">상태·카테고리 필터 적용 후에도 &quot;필터 전체&quot;로 전체 선택 시 해당 결과 전체가 선택됩니다 (페이지 이동 후 유지).</p>
            </div>
          </CardBody>
        </Card>

        {loadError && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800 text-sm flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <Button variant="secondary" size="sm" onClick={() => { setLoadError(null); loadData(); }}>
              재시도
            </Button>
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
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="w-12">
                        <input
                          ref={headerCheckboxRef}
                          type="checkbox"
                          checked={currentPageRequestIds.length > 0 && currentPageRequestIds.every(id => selectedIds.includes(id))}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds(prev => Array.from(new Set([...prev, ...currentPageRequestIds])));
                            } else {
                              setSelectedIds(prev => prev.filter(id => !currentPageRequestIds.includes(id)));
                            }
                          }}
                          className="rounded border-gray-300"
                          title="현재 페이지 전체 선택/해제"
                        />
                      </th>
                      <th className="w-14">순번</th>
                      <th className="min-w-[80px]">고객명</th>
                      <th className="min-w-[110px]">연락처</th>
                      <th className="min-w-[80px]">유입처</th>
                      <th className="min-w-[100px]">상담요청</th>
                      <th className="min-w-[90px]">신청일</th>
                      <th className="min-w-[90px]">이사일자</th>
                      <th className="min-w-[160px]">배정상태(본사)</th>
                      <th className="min-w-[90px]">배정일</th>
                      <th className="min-w-[160px]">진행상태(업체)</th>
                      <th className="min-w-[90px]">예약일</th>
                      <th className="min-w-[180px]">메모(본사,업체 통합)</th>
                      <th className="min-w-[130px]">신상정보</th>
                      <th className="min-w-[70px]">평수</th>
                      <th className="min-w-[100px]">진행액(고객지불금)</th>
                      <th className="min-w-[110px]">지원금 변경사항</th>
                      <th className="min-w-[100px]">지원금액외 일정</th>
                      <th className="min-w-[70px]">납부</th>
                    </tr>
                  </thead>
                  <tbody>
                    {customers.length === 0 ? (
                      <tr>
                        <td colSpan={19} className="text-center text-gray-500 py-8">
                          서비스 요청이 없습니다
                        </td>
                      </tr>
                    ) : (
                      (() => {
                        let globalRowIdx = (page - 1) * pageSize;
                        return customers.map((customer) =>
                          normalizeServiceRequests(customer.service_requests).map((request: RequestRow, idx: number) => {
                            globalRowIdx += 1;
                            const pa = Array.isArray(request.partner_assignment) ? request.partner_assignment[0] : request.partner_assignment;
                            return (
                          <tr key={request.id}>
                            {/* 체크박스 */}
                            <td>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(request.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedIds(prev => (prev.includes(request.id) ? prev : [...prev, request.id]));
                                  } else {
                                    setSelectedIds(prev => prev.filter(id => id !== request.id));
                                  }
                                }}
                                className="rounded border-gray-300"
                              />
                            </td>
                            {/* 순번 */}
                            <td className="text-center text-sm text-gray-500">{globalRowIdx}</td>
                            {/* 고객명 */}
                            <td>
                              {idx === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setCustomerDetailModal(customer)}
                                  className="text-left hover:bg-gray-50 rounded p-1 -m-1"
                                >
                                  <span className="font-medium text-primary-600 underline decoration-dotted">{customer.name}</span>
                                </button>
                              ) : (
                                <span className="text-gray-400 text-xs">↑</span>
                              )}
                            </td>
                            {/* 연락처 */}
                            <td className="text-sm text-gray-700">
                              {idx === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setCustomerDetailModal(customer)}
                                  className="text-left hover:bg-gray-50 rounded p-0.5 -m-0.5 underline decoration-dotted text-primary-600"
                                >
                                  {customer.phone}
                                </button>
                              ) : null}
                            </td>
                            {/* 유입처 */}
                            <td className="text-sm text-gray-600">
                              {idx === 0 ? (customer.source_realtor?.business_name || '-') : ''}
                            </td>
                            {/* 상담요청 */}
                            <td>
                              <StatusBadge
                                label={SERVICE_CATEGORY_LABELS[request.category as ServiceCategory]}
                                variant="blue"
                              />
                              {!request.assigned_partner_id && (
                                <button
                                  onClick={() => openAssignModal(request)}
                                  className="ml-1 p-1 text-primary-600 hover:bg-primary-50 rounded inline-flex"
                                  title="배정"
                                >
                                  <UserPlus className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </td>
                            {/* 신청일 */}
                            <td className="text-gray-500 text-sm">
                              {(() => {
                                const createdAt = request.created_at || customer.created_at;
                                return createdAt ? new Date(createdAt).toLocaleDateString('ko-KR') : '—';
                              })()}
                            </td>
                            {/* 이사일자 */}
                            <td className="text-sm text-gray-600">
                              {idx === 0 ? (customer.moving_date || '—') : ''}
                            </td>
                            {/* 배정상태(본사) */}
                            <td>
                              <div className="space-y-1">
                                <select
                                  value={request.hq_status}
                                  onChange={(e) => handleStatusChange(request.id, e.target.value as HqStatus)}
                                  className={`text-xs px-2 py-1 rounded border-0 cursor-pointer ${
                                    request.hq_status === 'hq_review_needed' ? 'bg-red-200 text-red-800 font-semibold' :
                                    request.hq_status === 'unread' ? 'bg-red-100 text-red-700' :
                                    request.hq_status === 'assigned' ? 'bg-yellow-100 text-yellow-700' :
                                    request.hq_status === 'settlement_done' ? 'bg-green-100 text-green-700' :
                                    'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {statusOptions.filter(o => o.value).map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </select>
                                {request.assigned_partner && (
                                  <div className="text-[10px] text-gray-500 truncate max-w-[140px]" title={request.assigned_partner.business_name}>
                                    {request.assigned_partner.business_name}
                                  </div>
                                )}
                                {(statusHistory[request.id] ?? []).length > 0 && (
                                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                                    {(statusHistory[request.id] ?? []).map((h, i) => (
                                      <div key={i} className="text-[10px] text-gray-500 leading-tight">
                                        <span className="font-medium text-gray-700">{statusOptions.find(o => o.value === h.new_status)?.label ?? h.new_status}</span>
                                        {h.changed_by_name && <span> ({h.changed_by_name})</span>}
                                        <span className="ml-1 text-gray-400">{new Date(h.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </td>
                            {/* 배정일 */}
                            <td className="text-sm text-gray-500">
                              {request.assigned_partner_id && pa
                                ? (pa.created_at ? new Date(pa.created_at).toLocaleDateString('ko-KR') : '—')
                                : '—'}
                            </td>
                            {/* 진행상태(업체) */}
                            <td>
                              {request.assigned_partner_id ? (
                                (() => {
                                  const currentStatus = pa?.status || 'unread';
                                  const paHistory = pa ? (statusHistory[pa.id] ?? []) : [];
                                  return (
                                    <div className="space-y-1">
                                      <select
                                        value={currentStatus}
                                        onChange={(e) => {
                                          const v = e.target.value;
                                          if (v === 'cancelled') {
                                            setPartnerCancelModal({ requestId: request.id });
                                          } else if (v === 'reserved') {
                                            setReservedDateModal({ requestId: request.id });
                                            setReservedDate(pa?.installation_date || '');
                                          } else {
                                            handlePartnerStatusChange(request.id, v);
                                          }
                                        }}
                                        disabled={updatingPartnerStatus}
                                        className="text-xs px-2 py-1 rounded border border-gray-300 cursor-pointer"
                                      >
                                        {(['unread', 'read', 'consulting', 'reserved', 'completed', 'pending', 'cancelled'] as const).map((s) => (
                                          <option key={s} value={s}>{PARTNER_STATUS_LABELS[s]}</option>
                                        ))}
                                      </select>
                                      {pa?.status === 'cancelled' && (pa?.cancel_reason || pa?.cancel_reason_detail) && (
                                        <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
                                          취소사유: {PARTNER_CANCEL_REASON_LABELS[pa.cancel_reason as keyof typeof PARTNER_CANCEL_REASON_LABELS] ?? pa.cancel_reason}
                                          {pa.cancel_reason_detail && ` · ${pa.cancel_reason_detail}`}
                                        </div>
                                      )}
                                      {paHistory.length > 0 && (
                                        <div className="max-h-24 overflow-y-auto space-y-0.5">
                                          {paHistory.map((h, i) => (
                                            <div key={i} className="text-[10px] text-gray-500 leading-tight">
                                              <span className="font-medium text-gray-700">{PARTNER_STATUS_LABELS[h.new_status as keyof typeof PARTNER_STATUS_LABELS] ?? h.new_status}</span>
                                              {h.changed_by_name && <span> ({h.changed_by_name})</span>}
                                              <span className="ml-1 text-gray-400">{new Date(h.created_at).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()
                              ) : (
                                <span className="text-gray-400 text-xs">-</span>
                              )}
                            </td>
                            {/* 예약일 */}
                            <td className="text-sm text-gray-600">
                              {pa?.installation_date ? new Date(pa.installation_date).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' }) : '—'}
                            </td>
                            {/* 메모(본사, 제휴업체 통합) */}
                            <td>
                              <button
                                onClick={() => {
                                  setMemoTarget(request);
                                  setMemoText(request.hq_memo || '');
                                  setNewMemoText('');
                                  setRequestedProduct(request.requested_product ?? '');
                                  setCustomerPaymentAmount(pa?.customer_payment_amount != null ? String(pa.customer_payment_amount) : '');
                                  setSupportAmount(pa?.support_amount != null ? String(pa.support_amount) : '');
                                  setSupportAmountPromise(pa?.support_amount_promise ?? '');
                                  const def = revenueShareDefaults.find((d) => d.category === request.category);
                                  setRealtorCommissionAmount(
                                    pa?.realtor_commission_amount != null
                                      ? String(pa.realtor_commission_amount)
                                      : def?.realtor_commission_amount != null ? String(def.realtor_commission_amount) : ''
                                  );
                                  setRealtorCommissionCompleteAmount(
                                    pa?.realtor_commission_complete_amount != null
                                      ? String(pa.realtor_commission_complete_amount)
                                      : def?.realtor_commission_complete_amount != null ? String(def.realtor_commission_complete_amount) : ''
                                  );
                                  setPartnerPaymentRequestAmount(
                                    pa?.partner_payment_request_amount != null
                                      ? String(pa.partner_payment_request_amount)
                                      : def?.partner_payment_request_amount != null ? String(def.partner_payment_request_amount) : ''
                                  );
                                  setRealtorCommissionMemo(pa?.realtor_commission_memo ?? '');
                                  setShowMemoModal(true);
                                }}
                                className="text-left w-full hover:bg-gray-50 rounded p-1 -m-1"
                                title="메모 보기/편집"
                              >
                                <div className="text-xs text-gray-600 truncate max-w-[160px]">
                                  {request.hq_memo || '—'}
                                </div>
                                {(memoCounts[request.id] ?? 0) > 0 && (
                                  <span className="inline-flex items-center gap-0.5 mt-0.5 text-[10px] text-amber-700 bg-amber-50 rounded px-1.5 py-0.5" title="@ 본사/제휴 확인요청 메모 건수">
                                    <MessageSquare className="h-2.5 w-2.5" />
                                    확인요청 {memoCounts[request.id]}건
                                  </span>
                                )}
                              </button>
                            </td>
                            {/* 신상정보 (이사 전/후 주소) */}
                            <td className="text-xs text-gray-500">
                              {idx === 0 ? (
                                <div className="space-y-0.5 max-w-[120px]">
                                  {customer.current_address && <div className="truncate" title={customer.current_address}>{customer.current_address}</div>}
                                  {customer.moving_address && <div className="truncate" title={customer.moving_address}>→ {customer.moving_address}</div>}
                                  {!customer.current_address && !customer.moving_address && '—'}
                                </div>
                              ) : null}
                            </td>
                            {/* 평수 — 요구사항: 정확한 평수(area_pyeong_exact) 표시 */}
                            <td className="text-sm text-gray-500">
                              {idx === 0 ? (
                                <>
                                  {customer.area_size ? (AREA_SIZE_LABELS[customer.area_size] ?? customer.area_size) : '—'}
                                  {customer.area_pyeong_exact != null ? ` (${customer.area_pyeong_exact}평)` : ''}
                                </>
                              ) : ''}
                            </td>
                            {/* 진행액(고객지불금) */}
                            <td className="text-sm text-gray-600">
                              {pa?.customer_payment_amount != null
                                ? `${Number(pa.customer_payment_amount).toLocaleString()}원`
                                : '—'}
                            </td>
                            {/* 지원금 변경사항 */}
                            <td className="text-sm text-gray-600">
                              {pa?.support_amount != null
                                ? `${Number(pa.support_amount).toLocaleString()}원`
                                : '—'}
                            </td>
                            {/* 지원금액외 일정 */}
                            <td className="text-sm text-gray-500">
                              {pa?.support_amount_promise || '—'}
                            </td>
                            {/* 납부 */}
                            <td className="text-sm">
                              {pa?.partner_payment_request_amount != null ? (
                                <span className="text-green-700 font-medium">{Number(pa.partner_payment_request_amount).toLocaleString()}원</span>
                              ) : '—'}
                            </td>
                          </tr>
                            );
                          })
                        );
                      })()
                    )}
                  </tbody>
                </table>
              </div>

              {/* 페이지네이션 */}
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-gray-500">총 {total}건</span>
                  {selectedIds.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-full px-3 py-0.5">
                      <CheckSquare className="h-3.5 w-3.5" />
                      {selectedIds.length}건 선택 중
                      <button
                        type="button"
                        onClick={() => setSelectedIds([])}
                        className="ml-1 text-primary-400 hover:text-primary-700"
                        title="선택 해제"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )}
                </div>
                {totalPages > 1 && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const p = Math.max(1, page - 2) + i;
                      if (p > totalPages) return null;
                      return (
                        <Button key={p} size="sm" variant={p === page ? 'primary' : 'secondary'} onClick={() => setPage(p)}>
                          {p}
                        </Button>
                      );
                    })}
                    <Button size="sm" variant="secondary" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </Card>
      </div>

      {/* 배정 모달 */}
      {showAssignModal && assignTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-lg w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-xl font-bold">제휴업체 배정</h2>
              <button onClick={() => setShowAssignModal(false)}>
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="text-sm text-gray-500">카테고리</div>
                <div className="font-medium">{SERVICE_CATEGORY_LABELS[assignTarget.category as ServiceCategory]}</div>
              </div>

              {/* 랜덤 배정 */}
              <Button
                variant="secondary"
                onClick={handleRandomAssign}
                disabled={assigning}
                className="w-full mb-4"
              >
                <Shuffle className="h-4 w-4 mr-2" />
                랜덤 배정
              </Button>

              {/* 수동 선택 */}
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-gray-700 mb-3">직접 선택</p>
                {availablePartners.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4">해당 카테고리 업체가 없습니다</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {availablePartners.map((partner) => (
                      <label
                        key={partner.id}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                          selectedPartnerId === partner.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="partner"
                          value={partner.id}
                          checked={selectedPartnerId === partner.id}
                          onChange={() => setSelectedPartnerId(partner.id)}
                          className="mr-3"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{partner.business_name}</div>
                          <div className="text-xs text-gray-500">
                            {partner.manager_name} · {partner.manager_phone}
                            {partner.avg_rating && ` · ⭐ ${partner.avg_rating.toFixed(1)}`}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 p-6 border-t">
              <Button variant="secondary" onClick={() => setShowAssignModal(false)} className="flex-1">
                취소
              </Button>
              <Button
                variant="primary"
                onClick={handleAssign}
                disabled={!selectedPartnerId || assigning}
                className="flex-1"
              >
                {assigning ? '배정 중...' : '배정하기'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 메모·상세 모달 (본사 메모, 통합 메모, @ 확인요청, 신청상품·진행/지원금액) */}
      {showMemoModal && memoTarget && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-lg w-full my-4 shadow-xl">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">메모 · 상세</h2>
              <button type="button" onClick={() => setShowMemoModal(false)}>
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
              {/* 신청상품 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">신청상품</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="예: KT / TV(프라임)+인터넷(500M)"
                    value={requestedProduct}
                    onChange={(e) => setRequestedProduct(e.target.value)}
                  />
                  <Button size="sm" variant="secondary" onClick={handleSaveRequestedProduct} disabled={savingAmounts}>
                    {savingAmounts ? '...' : '저장'}
                  </Button>
                </div>
              </div>
              {/* 진행금액·지원금액·공인중개사수익쉐어 (배정된 경우만) */}
              {memoTarget.assigned_partner_id && (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 mb-2">제휴업체 금액 정보</p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">진행금액(고객지불)</label>
                        <input
                          type="number"
                          className="input w-full"
                          placeholder="원"
                          value={customerPaymentAmount}
                          onChange={(e) => setCustomerPaymentAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">지원금액</label>
                        <input
                          type="number"
                          className="input w-full"
                          placeholder="원"
                          value={supportAmount}
                          onChange={(e) => setSupportAmount(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">지원금액 약속일정</label>
                        <input
                          type="text"
                          className="input w-full"
                          placeholder="날짜 또는 텍스트"
                          value={supportAmountPromise}
                          onChange={(e) => setSupportAmountPromise(e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-green-700">공인중개사 수익쉐어 · 제휴업체 결제금액 (건별 설정)</p>
                      {memoTarget && (() => {
                        const def = revenueShareDefaults.find((d) => d.category === memoTarget.category);
                        if (!def) return null;
                        return (
                          <button
                            type="button"
                            className="text-xs text-blue-600 hover:underline"
                            onClick={() => {
                              setRealtorCommissionAmount(def.realtor_commission_amount != null ? String(def.realtor_commission_amount) : '');
                              setRealtorCommissionCompleteAmount(def.realtor_commission_complete_amount != null ? String(def.realtor_commission_complete_amount) : '');
                              setPartnerPaymentRequestAmount(def.partner_payment_request_amount != null ? String(def.partner_payment_request_amount) : '');
                            }}
                          >
                            기본값 불러오기
                          </button>
                        );
                      })()}
                    </div>

                    {/* 업종별 기본값 참고 배너 */}
                    {memoTarget && (() => {
                      const def = revenueShareDefaults.find((d) => d.category === memoTarget.category);
                      if (!def) return null;
                      return (
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 bg-white border border-green-100 rounded px-2 py-1.5">
                          <span className="font-medium text-gray-600">업종 기본값 참고:</span>
                          <span className="text-blue-600 font-medium">
                            🔵 상담요청 {def.realtor_commission_amount != null ? `${def.realtor_commission_amount.toLocaleString()}원` : '미설정'}
                          </span>
                          <span className="text-emerald-600 font-medium">
                            🟢 전체완료 {def.realtor_commission_complete_amount != null ? `${def.realtor_commission_complete_amount.toLocaleString()}원` : '미설정'}
                          </span>
                          <span className="text-orange-600 font-medium">
                            🟠 업체 결제요청 {def.partner_payment_request_amount != null ? `${def.partner_payment_request_amount.toLocaleString()}원` : '미설정'}
                          </span>
                        </div>
                      );
                    })()}

                    {/* 중개사 수익 — 상담요청 시 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500 mr-1" />
                          중개사 수익 — 상담요청 시 (원)
                        </label>
                        <input
                          type="number"
                          min={0}
                          className="input w-full"
                          placeholder="기본값 자동 적용"
                          value={realtorCommissionAmount}
                          onChange={(e) => setRealtorCommissionAmount(e.target.value)}
                        />
                      </div>

                      {/* 중개사 수익 — 전체완료 시 */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1" />
                          중개사 수익 — 전체완료 시 (원)
                        </label>
                        <input
                          type="number"
                          min={0}
                          className="input w-full"
                          placeholder="기본값 자동 적용"
                          value={realtorCommissionCompleteAmount}
                          onChange={(e) => setRealtorCommissionCompleteAmount(e.target.value)}
                        />
                      </div>
                    </div>

                    {/* 제휴업체 결제 요청 금액 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-orange-500 mr-1" />
                          제휴업체 결제 요청금액 (원)
                        </label>
                        <input
                          type="number"
                          min={0}
                          className="input w-full"
                          placeholder="기본값 자동 적용"
                          value={partnerPaymentRequestAmount}
                          onChange={(e) => setPartnerPaymentRequestAmount(e.target.value)}
                        />
                      </div>

                      {/* 수익쉐어 메모 */}
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">수익쉐어 메모 (선택)</label>
                        <input
                          type="text"
                          className="input w-full"
                          placeholder="예: 포장이사, 특이사항 등"
                          value={realtorCommissionMemo}
                          onChange={(e) => setRealtorCommissionMemo(e.target.value)}
                        />
                      </div>
                    </div>

                    <p className="text-xs text-green-600">기본값은 설정 → DB 가격·수익쉐어에서 관리됩니다. 이 건에만 다른 금액이 필요할 때 수정하세요.</p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={handleSaveAmounts} disabled={savingAmounts}>
                    {savingAmounts ? '저장 중...' : '금액 저장'}
                  </Button>
                </>
              )}

              {/* 본사 메모 (레거시 단일 필드) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">본사 메모 (단일)</label>
                <textarea
                  className="input w-full h-20 resize-none"
                  placeholder="본사 전용 메모..."
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                />
                <Button size="sm" variant="secondary" onClick={handleSaveMemo} disabled={savingMemo} className="mt-2">
                  <Save className="h-4 w-4 mr-1" />
                  {savingMemo ? '저장 중...' : '본사 메모 저장'}
                </Button>
              </div>

              {/* 통합 메모 (본사·제휴 공유, @ 확인요청) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">통합 메모 (본사·제휴 공유)</label>
                <p className="text-xs text-gray-500 mb-2">@본사, @제휴업체 등으로 확인요청 가능</p>
                {loadingMemos ? (
                  <p className="text-sm text-gray-500">로딩 중...</p>
                ) : (
                  <div className="space-y-2 max-h-32 overflow-y-auto border rounded-lg p-2 bg-gray-50">
                    {unifiedMemos.length === 0 ? (
                      <p className="text-sm text-gray-400">메모 없음</p>
                    ) : (
                      unifiedMemos.map((m) => (
                        <div key={m.id} className="text-sm border-b border-gray-200 pb-2 last:border-0">
                          <span className="text-gray-500">
                            {m.created_by_user?.name ?? m.created_by ?? '직원'} · {new Date(m.created_at).toLocaleString('ko-KR')}
                            {m.content.includes('@') && <span className="ml-1 text-amber-600">확인요청</span>}
                          </span>
                          <p className="mt-0.5 whitespace-pre-wrap">{m.content}</p>
                        </div>
                      ))
                    )}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <textarea
                    className="input flex-1 h-16 resize-none"
                    placeholder="메모 입력. @본사 @제휴업체 등 확인요청 가능"
                    value={newMemoText}
                    onChange={(e) => setNewMemoText(e.target.value)}
                  />
                  <Button size="sm" variant="primary" onClick={handleAddUnifiedMemo} disabled={savingMemo || !newMemoText.trim()}>
                    추가
                  </Button>
                </div>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="secondary" onClick={() => setShowMemoModal(false)} className="flex-1">닫기</Button>
            </div>
          </div>
        </div>
      )}

      {/* 제휴업체 취소 사유 모달 */}
      {partnerCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">취소 사유</h2>
              <button onClick={() => { setPartnerCancelModal(null); setPartnerCancelReason(''); setPartnerCancelDetail(''); }}>
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <label className="block text-sm font-medium text-gray-700">사유 선택</label>
              <select
                value={partnerCancelReason}
                onChange={(e) => setPartnerCancelReason(e.target.value)}
                className="input w-full"
              >
                <option value="">선택</option>
                {(Object.entries(PARTNER_CANCEL_REASON_LABELS) as [string, string][]).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">상세 (선택)</label>
                <input
                  type="text"
                  value={partnerCancelDetail}
                  onChange={(e) => setPartnerCancelDetail(e.target.value)}
                  className="input w-full"
                  placeholder="기타 상세"
                />
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="secondary" onClick={() => { setPartnerCancelModal(null); setPartnerCancelReason(''); setPartnerCancelDetail(''); }} className="flex-1">취소</Button>
              <Button variant="primary" onClick={confirmPartnerCancel} disabled={!partnerCancelReason || updatingPartnerStatus} className="flex-1">
                취소 처리
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 예약완료 날짜 모달 */}
      {reservedDateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">예약완료 정보 입력</h2>
              <button onClick={() => { setReservedDateModal(null); setReservedDate(''); setReservedPrice(''); setReservedSubsidyAmount(''); setReservedSubsidyDate(''); }}>
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="p-4 bg-green-50 rounded-xl space-y-4">
                <h4 className="text-sm font-semibold text-green-800">예약 상세 정보</h4>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">예약일자 <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={reservedDate}
                    onChange={(e) => setReservedDate(e.target.value)}
                    className="input w-full"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">진행 금액 (원)</label>
                  <input
                    type="number"
                    min={0}
                    value={reservedPrice}
                    onChange={(e) => setReservedPrice(e.target.value)}
                    className="input w-full"
                    placeholder="예: 350000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">지원금 (원, 있을 경우)</label>
                  <input
                    type="number"
                    min={0}
                    value={reservedSubsidyAmount}
                    onChange={(e) => setReservedSubsidyAmount(e.target.value)}
                    className="input w-full"
                    placeholder="예: 50000"
                  />
                </div>
                {reservedSubsidyAmount && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">지원금 지급 시기</label>
                    <input
                      type="date"
                      value={reservedSubsidyDate}
                      onChange={(e) => setReservedSubsidyDate(e.target.value)}
                      className="input w-full"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="secondary" onClick={() => { setReservedDateModal(null); setReservedDate(''); setReservedPrice(''); setReservedSubsidyAmount(''); setReservedSubsidyDate(''); }} className="flex-1">취소</Button>
              <Button variant="primary" onClick={confirmReservedDate} disabled={!reservedDate || updatingPartnerStatus} className="flex-1">
                {updatingPartnerStatus ? '저장 중...' : '예약완료 저장'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 고객 상세 팝업 (요구사항: 신청일, 고객명, 연락처, 이사 전/후 주소, 이사일자, 평수, 신청항목) */}
      {customerDetailModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet" onClick={() => setCustomerDetailModal(null)}>
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b">
              <h2 className="text-lg font-bold">고객 상세</h2>
              <button type="button" onClick={() => setCustomerDetailModal(null)}>
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div><span className="text-gray-500">첫 신청일</span> {(() => {
                const reqs = normalizeServiceRequests(customerDetailModal.service_requests);
                let first: RequestRow | null = null;
                if (reqs.length) {
                  first = reqs.reduce<RequestRow | null>(
                    (a, r) =>
                      !a || (r.created_at && (!a.created_at || r.created_at < a.created_at))
                        ? r
                        : a,
                    null
                  );
                }
                return first?.created_at ? new Date(first.created_at).toLocaleString('ko-KR') : '—';
              })()}</div>
              <div><span className="text-gray-500">고객명</span> <span className="font-medium">{customerDetailModal.name}</span></div>
              <div><span className="text-gray-500">연락처</span> {customerDetailModal.phone}</div>
              <div><span className="text-gray-500">이사 전 주소</span> {customerDetailModal.current_address || '-'}</div>
              <div><span className="text-gray-500">이사 후 주소</span> {customerDetailModal.moving_address || '-'}</div>
              <div><span className="text-gray-500">이사일자</span> {customerDetailModal.moving_date ? new Date(customerDetailModal.moving_date).toLocaleDateString('ko-KR') : '-'}</div>
              <div><span className="text-gray-500">평수</span> {customerDetailModal.area_size ? (AREA_SIZE_LABELS[customerDetailModal.area_size] ?? customerDetailModal.area_size) : '-'}{customerDetailModal.area_pyeong_exact != null ? ` (정확: ${customerDetailModal.area_pyeong_exact}평)` : ''}</div>
              <div><span className="text-gray-500">유입처</span> {customerDetailModal.source_realtor?.business_name || '-'}</div>
              <div>
                <span className="text-gray-500">신청항목</span>
                <ul className="mt-1 list-disc list-inside">
                  {normalizeServiceRequests(customerDetailModal.service_requests).map((r: RequestRow) => (
                    <li key={r.id}>
                      {SERVICE_CATEGORY_LABELS[r.category as ServiceCategory]} · 신청일 {r.created_at ? new Date(r.created_at).toLocaleString('ko-KR') : '-'}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 선택 배정 모달 */}
      {showBulkSpecificAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-lg w-full">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-xl font-bold">일괄 선택 배정</h2>
                <p className="text-sm text-gray-500 mt-0.5">선택한 {selectedIds.length}건을 한 업체에 배정합니다</p>
              </div>
              <button onClick={() => setShowBulkSpecificAssignModal(false)}>
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* 카테고리 필터 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">카테고리로 업체 필터</label>
                <select
                  value={bulkSpecificCategoryFilter}
                  onChange={(e) => setBulkSpecificCategoryFilter(e.target.value)}
                  className="input w-full"
                >
                  <option value="">전체 업체 보기</option>
                  {Object.entries(SERVICE_CATEGORY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {/* 업체 목록 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  배정할 업체 선택
                  {bulkSpecificPartners.length > 0 && <span className="ml-1 text-gray-400 font-normal">({bulkSpecificPartners.length}개)</span>}
                </label>
                {bulkSpecificPartners.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-4 border rounded-lg">
                    {bulkSpecificCategoryFilter ? '해당 카테고리 업체가 없습니다' : '업체를 불러오는 중...'}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {bulkSpecificPartners.map((partner) => (
                      <label
                        key={partner.id}
                        className={`flex items-center p-3 rounded-lg border cursor-pointer transition-colors ${
                          bulkSpecificPartnerId === partner.id
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="bulkSpecificPartner"
                          value={partner.id}
                          checked={bulkSpecificPartnerId === partner.id}
                          onChange={() => setBulkSpecificPartnerId(partner.id)}
                          className="mr-3"
                        />
                        <div className="flex-1">
                          <div className="font-medium">{partner.business_name}</div>
                          <div className="text-xs text-gray-500">
                            {partner.manager_name} · {partner.manager_phone}
                            {partner.avg_rating != null && ` · ⭐ ${partner.avg_rating.toFixed(1)}`}
                          </div>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {bulkSpecificPartnerId && (
                <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
                  카테고리가 맞지 않는 건이 포함된 경우 해당 건은 실패 처리됩니다.
                </div>
              )}
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="secondary" onClick={() => setShowBulkSpecificAssignModal(false)} className="flex-1">
                취소
              </Button>
              <Button
                variant="primary"
                onClick={handleBulkSpecificAssign}
                disabled={!bulkSpecificPartnerId || bulkSpecificAssigning}
                className="flex-1"
              >
                {bulkSpecificAssigning ? '배정 중...' : `${selectedIds.length}건 배정하기`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 취소 사유 모달 */}
      {showBulkCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="flex items-center justify-between p-6 border-b">
              <div>
                <h2 className="text-lg font-bold text-red-700">일괄 취소 처리</h2>
                <p className="text-sm text-gray-500 mt-0.5">선택한 {selectedIds.length}건을 취소 상태로 변경합니다</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowBulkCancelModal(false); setBulkCancelMemo(''); setBulkStatusValue(''); }}
              >
                <X className="h-6 w-6 text-gray-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <p className="font-medium mb-1">⚠ 주의</p>
                <p>취소 처리된 건은 배정이 해제되지 않으며 본사 상태만 &quot;취소&quot;로 변경됩니다.</p>
                <p className="mt-1">배정도 함께 해제하려면 &apos;선택 건 배정 취소&apos; 버튼을 먼저 사용하세요.</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  취소 사유 메모 <span className="text-gray-400 font-normal">(선택)</span>
                </label>
                <textarea
                  className="input w-full h-20 resize-none"
                  placeholder="예: 고객 변심, 중복 신청 등 취소 사유를 입력하세요"
                  value={bulkCancelMemo}
                  onChange={(e) => setBulkCancelMemo(e.target.value)}
                />
                <p className="text-xs text-gray-400 mt-1">입력 시 각 건의 본사 메모(단일)에 저장됩니다.</p>
              </div>
            </div>
            <div className="flex gap-3 p-6 border-t">
              <button
                type="button"
                onClick={() => { setShowBulkCancelModal(false); setBulkCancelMemo(''); setBulkStatusValue(''); }}
                className="flex-1 px-4 py-2 rounded-lg border border-gray-300 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                돌아가기
              </button>
              <button
                type="button"
                onClick={handleBulkCancelConfirm}
                disabled={bulkCancelling}
                className="flex-1 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {bulkCancelling ? '처리 중...' : `${selectedIds.length}건 취소 확정`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 일괄 배정 취소 확인 (당일만 가능, 경고 다수 — 서비스요청 수정사항 요구) */}
      {showBulkUnassignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold text-amber-800">배정 일괄 취소</h2>
            </div>
            <div className="p-6 space-y-3 text-sm">
              <div className="rounded-lg bg-amber-50 border-2 border-amber-300 p-4 space-y-2">
                <p className="text-amber-800 font-bold">⚠ 반드시 확인하세요</p>
                <p className="text-amber-700 font-medium">· 당일 배정된 건만 취소됩니다. 당일 이전에 배정된 건은 자동으로 제외됩니다.</p>
                <p className="text-amber-700 font-medium">· 배정 해제 후 해당 DB는 미배정 상태로 전환되며, 타 업체가 DB 구매(배정)할 수 있습니다.</p>
                <p className="text-amber-700">· 이 작업은 되돌릴 수 없습니다. 진행 후에는 다시 배정해야 합니다.</p>
              </div>
              <p className="text-gray-600">선택한 {selectedIds.length}건 중 당일 배정 건에 대해 배정을 해제합니다. 계속할까요?</p>
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button variant="secondary" onClick={() => setShowBulkUnassignModal(false)} className="flex-1">아니오</Button>
              <Button variant="primary" onClick={handleBulkUnassign} disabled={bulkUnassigning} className="flex-1">
                {bulkUnassigning ? '처리 중...' : '예, 배정 취소'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

export { RequestsPage };
