'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Search,
  Phone,
  MapPin,
  Calendar,
  MessageSquare,
  ChevronDown,
  ChevronUp,
  X,
  CheckCircle,
  Eye,
  UserX,
  Ban,
  Home,
  RefreshCw,
  ShoppingCart,
  Filter,
} from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { showError } from '@/lib/toast';
import { AbsentSmsTemplate } from './AbsentSmsTemplate';
import { STATUS_ORDER, STATUS_CONFIG, QUICK_TRANSITIONS, STATUS_FILTERS, CATEGORY_LABELS, CANCEL_REASONS } from './assignments-constants';
import { type Assignment, normalizeAssignment, addressToMajorRegion } from './assignments-utils';

interface Memo {
  id: string;
  memo: string;
  status_at_time: string | null;
  created_at: string;
}

export default function PartnerMyDb() {
  const searchParams = useSearchParams();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [partnerId, setPartnerId] = useState('');
  const [accessDenied, setAccessDenied] = useState(false); // realtor 등 제휴업체가 아닌 사용자 접근 시
  const [statusFilter, setStatusFilter] = useState(searchParams?.get('status') || '');
  const [search, setSearch] = useState('');
  const srParam = searchParams?.get('sr') || '';
  const [sourceFilter, setSourceFilter] = useState<'all' | 'assigned' | 'purchased'>('all');

  // 일괄 선택
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState('');
  const [bulkUpdating, setBulkUpdating] = useState(false);

  // 상태변경 모달
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modal, setModal] = useState<'status' | 'memo' | null>(null);
  const [newStatus, setNewStatus] = useState('');
  const [installDate, setInstallDate] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [visitDate, setVisitDate] = useState('');
  const [reservedPrice, setReservedPrice] = useState('');
  const [subsidyAmount, setSubsidyAmount] = useState('');
  const [subsidyDate, setSubsidyDate] = useState('');
  const [customerPaymentAmount, setCustomerPaymentAmount] = useState('');
  const [memoText, setMemoText] = useState('');
  const [updating, setUpdating] = useState(false);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [memoLoading, setMemoLoading] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const selectedAssignment = assignments.find((a) => a.id === selectedId) ?? null;

  const loadAssignments = useCallback(async () => {
    if (!supabase || !partnerId) return;
    setLoading(true);
    try {
      let query = supabase
        .from('partner_assignments')
        .select(`
          id, status, created_at, updated_at, installation_date, partner_memo,
          reserved_price, subsidy_amount, subsidy_payment_date, cancel_reason,
          service_request:service_requests(
            id, category,
            customer:customers(name, phone, moving_address, current_address, area_size, moving_type, moving_date)
          )
        `)
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false });

      if (statusFilter) query = query.eq('status', statusFilter);

      const { data } = await query;
      const rawList = data || [];

      const srIds = rawList
        .map((a: Record<string, unknown>) => {
          const sr = a.service_request as Record<string, unknown> | unknown[] | undefined;
          const srObj = Array.isArray(sr) ? (sr[0] as Record<string, unknown>) : sr;
          return srObj?.id as string | undefined;
        })
        .filter((id): id is string => !!id);

      let purchasedSet = new Set<string>();
      if (srIds.length > 0) {
        const { data: purchases } = await supabase
          .from('db_view_payments')
          .select('service_request_id')
          .eq('partner_id', partnerId)
          .in('service_request_id', srIds);
        purchasedSet = new Set((purchases || []).map((p: { service_request_id: string }) => p.service_request_id));
      }

      let normalized = rawList
        .map((raw: unknown) => {
          const a = normalizeAssignment(raw);
          if (!a) return null;
          const srId = a.service_request.id;
          return { ...a, source: (purchasedSet.has(srId) ? 'purchased' : 'assigned') as 'assigned' | 'purchased' };
        })
        .filter((a): a is Assignment => a != null);

      if (search) {
        const s = search.toLowerCase();
        normalized = normalized.filter(
          (a) =>
            a.service_request.customer.name.toLowerCase().includes(s) ||
            a.service_request.customer.phone.includes(s)
        );
      }

      if (sourceFilter !== 'all') {
        normalized = normalized.filter((a) => a.source === sourceFilter);
      }

      setAssignments(normalized);

      const unreadIds = rawList.filter((a: { status?: string }) => a.status === 'unread').map((a: { id?: string }) => a.id);
      if (unreadIds.length > 0) {
        await supabase.from('partner_assignments').update({ status: 'read', read_at: new Date().toISOString() }).in('id', unreadIds);
      }
    } catch {
      setAssignments([]);
      showError('배정 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [partnerId, statusFilter, search, sourceFilter]);

  useEffect(() => { initPartner(); }, []);

  useEffect(() => {
    if (partnerId) loadAssignments();
  }, [partnerId, statusFilter, search, sourceFilter, loadAssignments]);

  useEffect(() => { setSelectedIds([]); }, [statusFilter, search, sourceFilter]);

  // 알림톡 딥링크: ?sr=serviceRequestId 로 진입 시 해당 건 자동 확장
  useEffect(() => {
    if (!srParam || assignments.length === 0) return;
    const assignment = assignments.find((a) => a.service_request.id === srParam);
    if (assignment) setSelectedId(assignment.id);
  }, [srParam, assignments]);

  async function initPartner() {
    if (!supabase) {
      setLoading(false);
      return;
    }
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: userData } = await supabase.from('users').select('role').eq('id', user.id).single();
      const role = userData?.role;
      // 공인중개사(realtor)는 이 페이지 접근 불가 — 제휴업체(partner) 전용
      if (role === 'realtor') {
        setAccessDenied(true);
        setLoading(false);
        return;
      }
      const { data: partner } = await supabase.from('partners').select('id').eq('user_id', user.id).single();
      if (partner) {
        setPartnerId(partner.id);
      } else {
        setLoading(false);
      }
    } catch {
      setLoading(false);
      showError('인증 정보를 불러오지 못했습니다. 다시 시도해 주세요.');
    }
  }

  /** 메모 이력 로드 */
  async function loadMemos(assignmentId: string) {
    if (!supabase) return;
    setMemoLoading(true);
    try {
      const { data, error } = await supabase
        .from('partner_assignment_memos')
        .select('id, memo, status_at_time, created_at')
        .eq('assignment_id', assignmentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setMemos(data || []);
    } catch {
      setMemos([]);
      showError('메모 이력을 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setMemoLoading(false);
    }
  }

  /** 퀵 상태 변경 — 단순 전환은 모달 없이, 복잡 전환은 해당 상태 미리 선택해 모달 오픈 */
  async function handleQuickStatusChange(a: Assignment) {
    const nextStatus = QUICK_TRANSITIONS[a.status];
    if (!nextStatus) return;

    const needsInput = ['visiting', 'reserved', 'cancelled', 'completed'].includes(nextStatus);

    if (needsInput) {
      setSelectedId(a.id);
      setNewStatus(nextStatus);
      setInstallDate(a.installation_date?.slice(0, 10) || '');
      setVisitDate('');
      setCancelReason('');
      setReservedPrice(a.reserved_price ? String(a.reserved_price) : '');
      setSubsidyAmount(a.subsidy_amount ? String(a.subsidy_amount) : '');
      setSubsidyDate(a.subsidy_payment_date || '');
      setCustomerPaymentAmount('');
      setMemoText('');
      setModal('status');
      return;
    }

    if (!supabase) return;
    const cfg = STATUS_CONFIG[nextStatus];
    if (!confirm(`'${STATUS_CONFIG[a.status]?.label}' → '${cfg?.label}'으로 변경하시겠습니까?`)) return;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/partner/assignment-update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ assignmentId: a.id, status: nextStatus, updated_at: a.updated_at }),
      });
      if (res.ok) {
        loadAssignments();
      } else {
        const data = await res.json();
        if (res.status === 409) {
          alert('다른 기기에서 변경되었습니다. 새로고침 후 다시 시도해주세요.');
        } else {
          alert(data.error || '변경 실패');
        }
      }
    } catch {
      alert('오류가 발생했습니다.');
    }
  }

  /** 상태 변경 모달 열기 */
  function openStatusModal(a: Assignment) {
    setSelectedId(a.id);
    setNewStatus('');
    setInstallDate(a.installation_date?.slice(0, 10) || '');
    setVisitDate((a as Assignment & { visit_date?: string | null }).visit_date?.slice(0, 10) || '');
    setCancelReason('');
    setReservedPrice(a.reserved_price ? String(a.reserved_price) : '');
    setSubsidyAmount(a.subsidy_amount ? String(a.subsidy_amount) : '');
    setSubsidyDate(a.subsidy_payment_date || '');
    setMemoText('');
    setModal('status');
  }

  /** 예약완료/취소로 바로 열기 — 본사 정산을 위해 제휴사가 반드시 눌러야 하는 버튼 노출용 */
  function openStatusModalWithPreset(a: Assignment, preset: 'reserved' | 'cancelled' | 'completed') {
    setSelectedId(a.id);
    setNewStatus(preset);
    setInstallDate(a.installation_date?.slice(0, 10) || '');
    setVisitDate((a as Assignment & { visit_date?: string | null }).visit_date?.slice(0, 10) || '');
    setCancelReason('');
    setReservedPrice(a.reserved_price ? String(a.reserved_price) : '');
    setSubsidyAmount(a.subsidy_amount ? String(a.subsidy_amount) : '');
    setSubsidyDate(a.subsidy_payment_date || '');
    setCustomerPaymentAmount(preset === 'completed' && a.reserved_price ? String(a.reserved_price) : '');
    setMemoText('');
    setModal('status');
  }

  /** 메모 패널 열기 */
  async function openMemoPanel(a: Assignment) {
    setSelectedId(a.id);
    setMemoText('');
    setModal('memo');
    await loadMemos(a.id);
  }

  function closeModal() {
    setModal(null);
    setSelectedId(null);
    setNewStatus('');
    setVisitDate('');
    setMemoText('');
  }

  /** 일괄 상태변경 */
  async function handleBulkStatusChange() {
    if (!supabase || selectedIds.length === 0 || !bulkStatus) return;
    if (!confirm(`선택한 ${selectedIds.length}건의 상태를 '${STATUS_CONFIG[bulkStatus]?.label ?? bulkStatus}'으로 변경하시겠습니까?`)) return;
    setBulkUpdating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const results = await Promise.allSettled(
        selectedIds.map((id) => {
          const a = assignments.find((x) => x.id === id);
          if (!a) return Promise.reject(new Error('not found'));
          return fetch('/api/partner/assignment-update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
            body: JSON.stringify({ assignmentId: id, status: bulkStatus, updated_at: a.updated_at }),
          });
        })
      );
      const successCount = results.filter((r) => r.status === 'fulfilled').length;
      const failCount = results.length - successCount;
      alert(`변경 완료: ${successCount}건${failCount > 0 ? `, 실패: ${failCount}건` : ''}`);
      setSelectedIds([]);
      setBulkStatus('');
      loadAssignments();
    } catch {
      showError('일괄 상태 변경 중 오류가 발생했습니다. 다시 시도해 주세요.');
    } finally {
      setBulkUpdating(false);
    }
  }

  /** 다음 상태로 순환 */
  function getNextStatus(current: string): string {
    const idx = STATUS_ORDER.indexOf(current);
    if (idx < 0) return 'read';
    const nextIdx = (idx + 1) % STATUS_ORDER.length;
    return STATUS_ORDER[nextIdx];
  }

  /** 상태 변경 제출 */
  async function handleStatusChange() {
    if (!supabase || !selectedAssignment || !newStatus) return;
    setUpdating(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const body: Record<string, unknown> = {
        assignmentId: selectedAssignment.id,
        status: newStatus,
        updated_at: selectedAssignment.updated_at,
        partner_memo: memoText || selectedAssignment.partner_memo,
      };

      if (newStatus === 'visiting') {
        if (visitDate) body.visit_date = visitDate;
      }
      if (newStatus === 'reserved') {
        if (!installDate) { alert('예약일자를 입력해주세요.'); setUpdating(false); return; }
        body.installation_date = installDate;
        body.reserved_price = reservedPrice ? Number(reservedPrice) : null;
        body.subsidy_amount = subsidyAmount ? Number(subsidyAmount) : null;
        body.subsidy_payment_date = subsidyDate || null;
      }
      if (newStatus === 'cancelled') {
        if (!cancelReason) { alert('취소 사유를 선택해주세요.'); setUpdating(false); return; }
        body.cancel_reason = cancelReason === 'partner_reason' ? 'partner_issue' : cancelReason === 'other_vendor' ? 'other_partner' : cancelReason;
      }

      const res = await fetch('/api/partner/assignment-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          alert('다른 기기에서 변경되었습니다. 새로고침 후 다시 시도해주세요.');
        } else {
          alert(data.error || '변경 실패');
        }
        return;
      }

      // 메모가 있으면 별도 저장
      if (memoText.trim()) {
        await supabase.from('partner_assignment_memos').insert({
          assignment_id: selectedAssignment.id,
          partner_id: partnerId,
          memo: memoText.trim(),
          status_at_time: newStatus,
        });
      }

      closeModal();
      loadAssignments();
    } finally {
      setUpdating(false);
    }
  }

  /** 메모만 추가 — 본사 memos 테이블과 통합, @멘션 지원 */
  async function handleAddMemo() {
    if (!selectedId || !memoText.trim()) return;
    setUpdating(true);
    try {
      const sessionRes = supabase ? await supabase.auth.getSession() : null;
      const token = sessionRes?.data?.session?.access_token;
      const res = await fetch('/api/partner/memo-add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          assignmentId: selectedId,
          memo: memoText.trim(),
          status_at_time: selectedAssignment?.status || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || '메모 저장 실패');
        return;
      }
      setMemoText('');
      await loadMemos(selectedId);
    } finally {
      setUpdating(false);
    }
  }

  const fmt = (n: number) => `₩${n.toLocaleString()}`;

  // 상태별 건수 집계 (파이프라인 요약)
  const statusCounts = assignments.reduce<Record<string, number>>((acc, a) => {
    acc[a.status] = (acc[a.status] || 0) + 1;
    return acc;
  }, {});

  const pipelineSteps: { status: string; label: string; color: string; bg: string }[] = [
    { status: 'unread',    label: '상담전',  color: 'text-red-600',    bg: 'bg-red-50' },
    { status: 'read',      label: '진행중',  color: 'text-blue-600',   bg: 'bg-blue-50' },
    { status: 'consulting',label: '상담중',  color: 'text-indigo-600', bg: 'bg-indigo-50' },
    { status: 'visiting',  label: '방문상담',color: 'text-purple-600', bg: 'bg-purple-50' },
    { status: 'absent',    label: '부재중',  color: 'text-orange-600', bg: 'bg-orange-50' },
    { status: 'reserved',  label: '예약완료',color: 'text-green-600',  bg: 'bg-green-50' },
    { status: 'completed', label: '완료',    color: 'text-emerald-600',bg: 'bg-emerald-50' },
  ];

  if (accessDenied) {
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-8 max-w-xl mx-auto text-center">
          <div className="flex justify-center mb-4">
            <UserX className="w-12 h-12 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-amber-800 mb-2">제휴업체 전용 메뉴입니다</h2>
          <p className="text-sm text-amber-700 mb-6">
            이 페이지는 제휴업체(이사·청소·인터넷 등 서비스 업체) 전용입니다. 공인중개사님은 이용하실 수 없습니다.
          </p>
          <Link
            href="/partner/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-600 text-white rounded-xl text-sm font-medium hover:bg-amber-700 transition-colors"
          >
            대시보드로 돌아가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">내 DB 관리</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            배정·구매한 DB를 관리하고, 상태값을 변경하세요 (상담전 → 진행중 → 상담중 → 방문상담 → 부재중 → 예약완료 → 전체완료)
          </p>
          <p className="text-xs text-gray-400 mt-1">
            이 페이지를 열면 &apos;상담전&apos; 건이 자동으로 &apos;진행중(열람)&apos;으로 전환됩니다.
          </p>
        </div>
        <button type="button" onClick={() => loadAssignments()} className="p-2 rounded-xl bg-white border hover:bg-gray-50">
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* 구매 DB / 내 DB / 완료 탭 분리 */}
      <div className="flex gap-1 p-1 bg-gray-100 rounded-xl">
        <Link
          href="/partner/db-list"
          className="flex-1 flex justify-center py-2 rounded-lg font-medium text-sm text-gray-600 hover:bg-white/80 transition-colors"
        >
          구매 DB
        </Link>
        <Link
          href="/partner/assignments"
          className={`flex-1 flex justify-center py-2 rounded-lg font-medium text-sm transition-colors ${
            statusFilter !== 'completed' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-600 hover:bg-white/80'
          }`}
        >
          내 DB
        </Link>
        <Link
          href="/partner/assignments?status=completed"
          className={`flex-1 flex justify-center py-2 rounded-lg font-medium text-sm transition-colors ${
            statusFilter === 'completed' ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-600 hover:bg-white/80'
          }`}
        >
          완료
        </Link>
      </div>

      {/* 상태 파이프라인 요약 */}
      {!loading && assignments.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card p-4">
          <p className="text-xs font-semibold text-gray-400 mb-3 uppercase tracking-wide">상담 현황 파이프라인</p>
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {pipelineSteps.map((step, idx) => {
              const count = statusCounts[step.status] || 0;
              return (
                <div key={step.status} className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setStatusFilter(statusFilter === step.status ? '' : step.status)}
                    className={`flex flex-col items-center gap-1 px-2.5 py-2 rounded-xl transition-all ${
                      statusFilter === step.status
                        ? `${step.bg} ring-2 ring-offset-1`
                        : count > 0
                        ? `${step.bg} hover:opacity-80`
                        : 'bg-gray-50 opacity-40'
                    }`}
                  >
                    <span className={`text-base font-bold ${count > 0 ? step.color : 'text-gray-300'}`}>{count}</span>
                    <span className={`text-[10px] font-medium whitespace-nowrap ${count > 0 ? step.color : 'text-gray-300'}`}>{step.label}</span>
                  </button>
                  {idx < pipelineSteps.length - 1 && (
                    <span className="text-gray-300 text-xs select-none">›</span>
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-gray-400 mt-2">항목을 클릭하면 해당 상태만 필터링됩니다</p>
        </div>
      )}

      {/* 검색 + 필터 — 모바일: 필터 버튼 클릭 시 펼침 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        {/* 모바일: 필터 버튼 */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            <Filter className="w-4 h-4" />
            필터 {filterOpen ? '접기' : '펼치기'}
            {filterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
        {/* 필터 영역 — 데스크톱: 항상 표시, 모바일: 펼침 시만 */}
        <div className={`p-4 space-y-2 ${filterOpen ? 'block' : 'hidden md:block'}`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="고객명, 연락처 검색"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border rounded-xl text-sm focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary bg-white"
            />
          </div>

          {/* 소스 탭 */}
          <div className="flex gap-2 bg-gray-100 rounded-xl p-1">
            {([
              { v: 'all', l: '전체' },
              { v: 'assigned', l: '배정 DB' },
              { v: 'purchased', l: '구매 DB' },
            ] as const).map(({ v, l }) => (
              <button
                key={v}
                type="button"
                onClick={() => setSourceFilter(v)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  sourceFilter === v ? 'bg-white text-brand-primary shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {l}
              </button>
            ))}
          </div>

          {/* 상태 필터 */}
          <div ref={filterRef} className="flex gap-1.5 overflow-x-auto pb-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`px-3 py-1.5 rounded-xl text-xs font-medium whitespace-nowrap transition-colors ${
                  statusFilter === f.value
                    ? 'bg-brand-primary text-white'
                    : 'bg-white text-gray-600 border hover:bg-gray-50'
                }`}
              >
                {f.label}
                {f.value === '' && <span className="ml-1 text-gray-400">({assignments.length})</span>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 일괄 선택 액션 바 — 항상 표시(목록이 있을 때) */}
      {assignments.length > 0 && (
        <div className="bg-white rounded-2xl border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedIds.length === assignments.length && assignments.length > 0}
                ref={(el) => {
                  if (el) el.indeterminate = selectedIds.length > 0 && selectedIds.length < assignments.length;
                }}
                onChange={(e) => setSelectedIds(e.target.checked ? assignments.map((a) => a.id) : [])}
                className="rounded border-gray-300 w-4 h-4"
              />
              {selectedIds.length > 0 ? (
                <span className="text-brand-primary font-semibold">{selectedIds.length}건 선택됨</span>
              ) : (
                <span className="text-gray-500">0건 선택 · 전체 선택 후 일괄 상태변경</span>
              )}
            </label>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                선택 해제
              </button>
            )}
          </div>
          {/* 일괄 상태변경 — 선택 시에만 활성화, 없어도 영역은 항상 표시 */}
          <div className="flex gap-2 flex-wrap">
            <select
              value={bulkStatus}
              onChange={(e) => setBulkStatus(e.target.value)}
              className="flex-1 border rounded-xl px-3 py-2 text-sm min-w-[120px]"
              disabled={selectedIds.length === 0}
              title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}
            >
              <option value="">상태 선택</option>
              {(['consulting', 'visiting', 'absent', 'pending', 'cancelled'] as const).map((st) => (
                <option key={st} value={st}>{STATUS_CONFIG[st]?.label ?? st}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleBulkStatusChange}
              disabled={selectedIds.length === 0 || !bulkStatus || bulkUpdating}
              title={selectedIds.length === 0 ? '항목 선택 후 사용' : undefined}
              className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
            >
              {bulkUpdating ? '처리 중...' : '일괄 상태변경'}
            </button>
          </div>
        </div>
      )}

      {/* 목록 — 구매 후 내 DB / 완료 리스트 분리 (진행중 · 완료 섹션) */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
        </div>
      ) : assignments.length === 0 ? (
        <div className="text-center py-16 px-6 bg-white rounded-2xl shadow-card border border-gray-100">
          <Home className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-700 font-semibold mb-2">배정된 DB가 없습니다</p>
          <p className="text-sm text-gray-500 max-w-md mx-auto mb-4">
            본사에서 배정한 DB가 여기에 표시됩니다. 고객 신청 → 어드민 확인 → 제휴사 배정 → <strong>제휴사 열람</strong> 순으로 이어지며, 배정 후 이 페이지에서 열람·상태 변경을 하시면 됩니다.
          </p>
          <Link
            href="/partner/db-list"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <ShoppingCart className="w-4 h-4" />
            미배정 DB 구매하러 가기
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* 진행중 — 완료 제외 */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/80">
              <h2 className="text-sm font-bold text-gray-700">
                진행중 ({assignments.filter((a) => a.status !== 'completed').length}건)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">상담전 · 진행중 · 상담중 · 방문상담 · 부재중 · 예약완료</p>
            </div>
            <div className="divide-y divide-gray-100">
              {assignments.filter((a) => a.status !== 'completed').length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">진행중 건 없음</div>
              ) : (
                assignments
                  .filter((a) => a.status !== 'completed')
                  .map((a) => (
                    <AssignmentCard
                      key={a.id}
                      assignment={a}
                      selected={selectedIds.includes(a.id)}
                      onToggleSelect={() => setSelectedIds((prev) =>
                        prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                      )}
                      onStatusModal={() => openStatusModal(a)}
                      onReservedClick={() => openStatusModalWithPreset(a, 'reserved')}
                      onCompletedClick={() => openStatusModalWithPreset(a, 'completed')}
                      onCancelClick={() => openStatusModalWithPreset(a, 'cancelled')}
                      onMemoPanel={() => openMemoPanel(a)}
                      onQuickStatusChange={() => handleQuickStatusChange(a)}
                      getNextStatus={getNextStatus}
                    />
                  ))
              )}
            </div>
          </div>
          {/* 완료 리스트 */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 bg-emerald-50/80">
              <h2 className="text-sm font-bold text-emerald-800">
                완료 ({assignments.filter((a) => a.status === 'completed').length}건)
              </h2>
              <p className="text-xs text-emerald-600/80 mt-0.5">전체완료된 건</p>
            </div>
            <div className="divide-y divide-gray-100">
              {assignments.filter((a) => a.status === 'completed').length === 0 ? (
                <div className="px-4 py-6 text-center text-sm text-gray-400">완료 건 없음</div>
              ) : (
                assignments
                  .filter((a) => a.status === 'completed')
                  .map((a) => (
                    <AssignmentCard
                      key={a.id}
                      assignment={a}
                      selected={selectedIds.includes(a.id)}
                      onToggleSelect={() => setSelectedIds((prev) =>
                        prev.includes(a.id) ? prev.filter((id) => id !== a.id) : [...prev, a.id]
                      )}
                      onStatusModal={() => openStatusModal(a)}
                      onReservedClick={undefined}
                      onCompletedClick={undefined}
                      onCancelClick={undefined}
                      onMemoPanel={() => openMemoPanel(a)}
                      onQuickStatusChange={() => handleQuickStatusChange(a)}
                      getNextStatus={getNextStatus}
                    />
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 상태변경 모달 */}
      {modal === 'status' && selectedAssignment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">상태 변경</h3>
                <p className="text-sm text-gray-500">
                  {selectedAssignment.service_request.customer.name} —{' '}
                  {CATEGORY_LABELS[selectedAssignment.service_request.category]}
                </p>
              </div>
              <button type="button" onClick={closeModal} className="p-2 rounded-xl hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 현재 상태 */}
              <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
                <span className="text-sm text-gray-500">현재:</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${STATUS_CONFIG[selectedAssignment.status]?.color}`}>
                  {STATUS_CONFIG[selectedAssignment.status]?.label || selectedAssignment.status}
                </span>
              </div>

              {/* 변경할 상태 선택 */}
              <div>
                <label className="block text-sm font-medium mb-2">변경할 상태</label>
                <div className="grid grid-cols-2 gap-2">
                  {(selectedAssignment.status === 'reserved'
                    ? (['completed', 'consulting', 'visiting', 'absent', 'reserved', 'cancelled', 'pending'] as const)
                    : (['consulting', 'visiting', 'absent', 'reserved', 'cancelled', 'pending'] as const)
                  ).map((st) => {
                    const cfg = STATUS_CONFIG[st];
                    return (
                      <button
                        key={st}
                        type="button"
                        onClick={() => setNewStatus(st)}
                        className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                          newStatus === st
                            ? `${cfg.color} border-2`
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 방문상담 날짜 입력 */}
              {newStatus === 'visiting' && (
                <div className="space-y-3 p-4 bg-purple-50 rounded-xl">
                  <h4 className="text-sm font-semibold text-purple-800">방문상담 일정</h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">방문 예정일 (선택)</label>
                    <input
                      type="date"
                      value={visitDate}
                      onChange={(e) => setVisitDate(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                    />
                    <p className="text-xs text-purple-600 mt-1">
                      날짜 입력 시 고객에게 방문 예정 안내 문자가 발송됩니다.
                    </p>
                  </div>
                </div>
              )}

              {/* 예약완료 추가 입력 */}
              {newStatus === 'reserved' && (
                <div className="space-y-3 p-4 bg-green-50 rounded-xl">
                  <h4 className="text-sm font-semibold text-green-800">예약 상세 정보</h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">예약일자 *</label>
                    <input
                      type="date"
                      value={installDate}
                      onChange={(e) => setInstallDate(e.target.value)}
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">진행 금액 (원)</label>
                    <input
                      type="number"
                      value={reservedPrice}
                      onChange={(e) => setReservedPrice(e.target.value)}
                      placeholder="예: 500000"
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">지원금 (원, 있을 경우)</label>
                    <input
                      type="number"
                      value={subsidyAmount}
                      onChange={(e) => setSubsidyAmount(e.target.value)}
                      placeholder="예: 100000"
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                    />
                  </div>
                  {subsidyAmount && (
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">지원금 지급 시기</label>
                      <input
                        type="date"
                        value={subsidyDate}
                        onChange={(e) => setSubsidyDate(e.target.value)}
                        className="w-full border rounded-xl px-3 py-2 text-sm"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* 부재중 SMS 템플릿 자동 제공 */}
              {newStatus === 'absent' && (
                <AbsentSmsTemplate
                  customerName={selectedAssignment.service_request.customer.name}
                  customerPhone={selectedAssignment.service_request.customer.phone}
                  category={CATEGORY_LABELS[selectedAssignment.service_request.category] || selectedAssignment.service_request.category}
                />
              )}

              {/* 전체완료 진행금액 입력 */}
              {newStatus === 'completed' && (
                <div className="space-y-3 p-4 bg-emerald-50 rounded-xl">
                  <h4 className="text-sm font-semibold text-emerald-800">전체완료 — 진행금액 입력</h4>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">진행금액(고객지불) *</label>
                    <input
                      type="number"
                      value={customerPaymentAmount}
                      onChange={(e) => setCustomerPaymentAmount(e.target.value)}
                      placeholder="예: 500000"
                      className="w-full border rounded-xl px-3 py-2 text-sm"
                      required
                    />
                    <p className="text-xs text-emerald-600 mt-1">고객이 실제 지불한 금액을 입력해주세요. 본사 정산에 사용됩니다.</p>
                  </div>
                </div>
              )}

              {/* 취소 사유 */}
              {newStatus === 'cancelled' && (
                <div className="p-4 bg-red-50 rounded-xl space-y-2">
                  <label className="block text-sm font-medium text-red-800">취소 사유 *</label>
                  {[
                    { v: 'customer_cancel', l: '고객 일방 취소' },
                    { v: 'other_partner', l: '타 업체에 하기로 함' },
                    { v: 'partner_reason', l: '본 업체 사정으로 취소 (DB 반환)' },
                  ].map(({ v, l }) => (
                    <label key={v} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="cancel_reason"
                        value={v}
                        checked={cancelReason === v}
                        onChange={() => setCancelReason(v)}
                        className="text-brand-primary"
                      />
                      <span className="text-sm text-gray-700">{l}</span>
                    </label>
                  ))}
                  {cancelReason === 'partner_reason' && (
                    <p className="text-xs text-red-600 mt-1">
                      ※ DB가 본사로 반환됩니다. 고객의 취소 리스트에도 업체 정보가 기록됩니다.
                    </p>
                  )}
                </div>
              )}

              {/* 메모 — 본사와 통합, @ 멘션 가능 */}
              <div>
                <label className="block text-sm font-medium mb-1">상태변경 메모 (선택)</label>
                <textarea
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2.5 text-sm h-20 resize-none focus:ring-2 focus:ring-brand-primary/20"
                  placeholder="특이사항을 메모해주세요. 본사 확인요청 시 @ 사용 가능"
                />
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 py-3 border rounded-xl text-sm font-medium hover:bg-gray-50"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleStatusChange}
                  disabled={!newStatus || updating}
                  className="flex-1 py-3 bg-brand-primary text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {updating ? '처리 중...' : '변경 완료'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 메모 이력 패널 */}
      {modal === 'memo' && selectedAssignment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto">
            <div className="sticky top-0 bg-white px-5 pt-5 pb-3 border-b flex items-center justify-between">
              <div>
                <h3 className="font-bold text-lg">메모 이력</h3>
                <p className="text-sm text-gray-500">{selectedAssignment.service_request.customer.name}</p>
              </div>
              <button type="button" onClick={closeModal} className="p-2 rounded-xl hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* 메모 추가 — 본사와 통합, @ 멘션 가능 */}
              <div className="flex gap-2">
                <textarea
                  value={memoText}
                  onChange={(e) => setMemoText(e.target.value)}
                  className="flex-1 border rounded-xl px-3 py-2 text-sm h-16 resize-none focus:ring-2 focus:ring-brand-primary/20"
                  placeholder="메모 입력. 본사 확인요청 시 @ 사용 가능"
                />
                <button
                  type="button"
                  onClick={handleAddMemo}
                  disabled={!memoText.trim() || updating}
                  className="px-4 bg-brand-primary text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  추가
                </button>
              </div>

              {/* 메모 목록 */}
              {memoLoading ? (
                <div className="text-center py-4 text-gray-400 text-sm">로딩 중...</div>
              ) : memos.length === 0 ? (
                <div className="text-center py-4 text-gray-400 text-sm">메모가 없습니다</div>
              ) : (
                <div className="space-y-2">
                  {memos.map((m) => (
                    <div key={m.id} className="bg-gray-50 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-1">
                        {m.status_at_time && (
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CONFIG[m.status_at_time]?.color || 'bg-gray-100 text-gray-600'}`}>
                            {STATUS_CONFIG[m.status_at_time]?.label || m.status_at_time}
                          </span>
                        )}
                        <span className="text-xs text-gray-400 ml-auto">
                          {new Date(m.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-sm text-gray-700">{m.memo}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AssignmentCard({
  assignment: a,
  selected,
  onToggleSelect,
  onStatusModal,
  onReservedClick,
  onCompletedClick,
  onCancelClick,
  onMemoPanel,
  onQuickStatusChange,
  getNextStatus,
}: {
  assignment: Assignment;
  selected: boolean;
  onToggleSelect: () => void;
  onStatusModal: () => void;
  onReservedClick?: () => void;
  onCompletedClick?: () => void;
  onCancelClick?: () => void;
  onMemoPanel: () => void;
  onQuickStatusChange: () => void;
  getNextStatus: (s: string) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const customer = a.service_request.customer;
  const statusCfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const nextStatus = QUICK_TRANSITIONS[a.status] ?? getNextStatus(a.status);
  const nextCfg = STATUS_CONFIG[nextStatus] || STATUS_CONFIG.read;
  const hasQuickTransition = Boolean(QUICK_TRANSITIONS[a.status]);

  const isCompleted = a.status === 'completed' || a.status === 'cancelled';
  const showReservedButton = Boolean(onReservedClick) && a.status !== 'reserved' && a.status !== 'completed' && a.status !== 'cancelled';
  const showCompletedButton = Boolean(onCompletedClick) && a.status === 'reserved';
  const showCancelButton = Boolean(onCancelClick) && a.status !== 'cancelled' && a.status !== 'completed';

  return (
    <div className={`bg-white rounded-2xl shadow-card overflow-hidden ${
      selected ? 'ring-2 ring-brand-primary' :
      a.status === 'unread' ? 'border-l-4 border-l-red-500' :
      a.status === 'absent' ? 'border-l-4 border-l-orange-400' :
      a.status === 'reserved' ? 'border-l-4 border-l-green-500' : ''
    }`}>
      <div className="p-4">
        {/* 헤더 */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="checkbox"
              checked={selected}
              onChange={onToggleSelect}
              className="rounded border-gray-300 w-4 h-4 shrink-0"
              onClick={(e) => e.stopPropagation()}
            />
            <span className="bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {CATEGORY_LABELS[a.service_request.category] || a.service_request.category}
            </span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-0.5 ${statusCfg.color}`}>
              <StatusIcon className="w-3 h-3" />
              {statusCfg.label}
            </span>
            {a.status === 'unread' && (
              <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full animate-pulse font-semibold">NEW</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* 고객명 + 전화 */}
        <div className="flex items-center justify-between mb-2">
          <p className="font-semibold text-lg">{customer.name}</p>
          <a
            href={`tel:${customer.phone}`}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-primary text-white rounded-xl text-sm font-medium hover:bg-blue-700"
          >
            <Phone className="w-3.5 h-3.5" />
            전화
          </a>
        </div>

        {/* 핵심 정보 */}
        <div className="grid grid-cols-2 gap-2 text-sm text-gray-600 mb-3">
          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{addressToMajorRegion(customer.moving_address || customer.current_address || '')}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <span>{customer.moving_date ? new Date(customer.moving_date).toLocaleDateString('ko-KR') : '날짜 미정'}</span>
          </div>
        </div>

        {/* 예약 정보 */}
        {a.installation_date && (
          <div className="mb-2 flex items-center gap-2 bg-green-50 rounded-xl px-3 py-2 text-sm text-green-700">
            <CheckCircle className="w-3.5 h-3.5 shrink-0" />
            <span>예약일 {new Date(a.installation_date).toLocaleDateString('ko-KR')}</span>
            {a.reserved_price && (
              <span className="ml-auto font-semibold">₩{a.reserved_price.toLocaleString()}</span>
            )}
          </div>
        )}

        {/* 최근 메모 */}
        {a.partner_memo && (
          <div className="mb-2 bg-gray-50 rounded-xl px-3 py-2 text-sm text-gray-600">
            <span className="text-xs text-gray-400 block mb-0.5">최근 메모</span>
            {a.partner_memo}
          </div>
        )}

        {/* 하단 버튼 — 예약완료/취소는 본사 정산을 위해 항상 노출(진행중 건) */}
        <div className="flex flex-wrap gap-2 mt-2">
          {/* 예약완료: 본사 정산 시작 가능 상태로 전환 */}
          {showReservedButton && (
            <button
              type="button"
              onClick={onReservedClick}
              className="py-2 px-3 rounded-xl text-xs font-semibold bg-green-50 text-green-700 border-2 border-green-200 hover:bg-green-100 transition-colors"
            >
              예약완료
            </button>
          )}
          {/* 전체완료: 예약완료 건에서 진행금액 입력 후 완료 */}
          {showCompletedButton && (
            <button
              type="button"
              onClick={onCompletedClick}
              className="py-2 px-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 border-2 border-emerald-200 hover:bg-emerald-100 transition-colors"
            >
              전체완료
            </button>
          )}
          {/* 취소: 본사가 정산 제외 처리할 수 있도록 */}
          {showCancelButton && (
            <button
              type="button"
              onClick={onCancelClick}
              className="py-2 px-3 rounded-xl text-xs font-semibold bg-gray-100 text-gray-600 border-2 border-gray-200 hover:bg-gray-200 transition-colors"
            >
              취소
            </button>
          )}
          {/* 퀵 상태 변경 — 다음 단계 */}
          {!isCompleted && hasQuickTransition && (
            <button
              type="button"
              onClick={onQuickStatusChange}
              className={`py-2 px-3 rounded-xl text-xs font-semibold border-2 transition-colors ${nextCfg.color} hover:opacity-80`}
            >
              ↑ {nextCfg.label}
            </button>
          )}
          {/* 전체 상태 선택 모달 */}
          <button
            type="button"
            onClick={onStatusModal}
            className="py-2 px-3 bg-white border rounded-xl text-xs text-gray-600 font-medium hover:bg-gray-50"
          >
            {isCompleted ? '상태 보기' : '상태 변경'}
          </button>
          <button
            type="button"
            onClick={onMemoPanel}
            className="py-2 px-3 bg-white border rounded-xl text-xs text-gray-600 font-medium hover:bg-gray-50 flex items-center gap-1"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            메모
          </button>
        </div>
      </div>

      {/* 펼치기 상세 */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-gray-100 space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2 text-gray-600">
            <div><span className="text-xs text-gray-400 block">평수</span>{customer.area_size || '-'}</div>
            <div><span className="text-xs text-gray-400 block">이사 형태</span>{customer.moving_type || '-'}</div>
            <div><span className="text-xs text-gray-400 block">연락처</span>
              <a href={`tel:${customer.phone}`} className="text-brand-primary hover:underline">{customer.phone}</a>
            </div>
            <div><span className="text-xs text-gray-400 block">배정일</span>{new Date(a.created_at).toLocaleDateString('ko-KR')}</div>
          </div>
          {a.subsidy_amount && (
            <div className="bg-amber-50 rounded-xl px-3 py-2">
              <span className="text-xs text-amber-600 font-medium">지원금 정보</span>
              <div className="flex items-center justify-between mt-1">
                <span className="text-amber-800">₩{a.subsidy_amount.toLocaleString()}</span>
                {a.subsidy_payment_date && (
                  <span className="text-xs text-amber-600">지급 예정: {a.subsidy_payment_date}</span>
                )}
              </div>
            </div>
          )}
          {a.cancel_reason && (
            <div className="bg-red-50 rounded-xl px-3 py-2 text-red-700 text-xs">
              취소 사유: {CANCEL_REASONS[a.cancel_reason] || a.cancel_reason}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
