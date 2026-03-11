'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Download,
  Eye,
  QrCode,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Users,
  Bell,
  Database,
  Send,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useRealtorList } from '@/hooks/useRealtorList';
import { realtorListService } from '@/services/realtor-list.service';
import { useAuth } from '@/lib/auth';
import { getAuthHeaders } from '@/lib/auth-headers';
import { exportRealtors } from '@/lib/excel';
import { getErrorMessage, logger } from '@/lib/logger';
import { getSupabase } from '@/lib/supabase';
import { withTimeout, EXCEL_FETCH_TIMEOUT_MS, getTimeoutFriendlyMessage } from '@/lib/timeout';
import toast from 'react-hot-toast';

export default function RealtorsPage() {
  const { user, session } = useAuth();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [verifiedFilter, setVerifiedFilter] = useState<string>('');
  const [excelFilter, setExcelFilter] = useState<string>('');
  const [inactiveFilter, setInactiveFilter] = useState<string>('');

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectAll, setSelectAll] = useState(false);
  const [qrGenerating, setQrGenerating] = useState(false);
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [bulkStatusChanging, setBulkStatusChanging] = useState(false);
  const [bulkStatusValue, setBulkStatusValue] = useState<'active' | 'inactive' | 'suspended'>('active');
  const [syncing, setSyncing] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteReferrerId, setInviteReferrerId] = useState('');
  const [inviteSending, setInviteSending] = useState(false);

  const {
    data: realtorsData,
    isLoading: loading,
    error: loadError,
    refetch,
  } = useRealtorList({
    search: searchTerm || undefined,
    status: statusFilter || undefined,
    verified: verifiedFilter === '' ? undefined : verifiedFilter === 'true',
    excelNotDownloaded: excelFilter === 'not_downloaded' || undefined,
    inactiveDays: inactiveFilter === '14' ? 14 : undefined,
    page,
    limit: 20,
  });

  const realtors = realtorsData?.data ?? [];
  const total = realtorsData?.total ?? 0;
  const totalPages = realtorsData?.totalPages ?? 1;

  useEffect(() => {
    if (!searchParams) return;

    const inactive = searchParams.get('inactive');
    if (inactive === '14') setInactiveFilter('14');
  }, [searchParams]);

  useEffect(() => {
    const timer = setTimeout(() => setPage(1), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const handleSyncLastSignIn = async () => {
    setSyncing(true);
    const toastId = toast.loading('마지막 로그인 동기화 중...');
    try {
      const supabase = getSupabase();
      const { data: refreshData } = await supabase.auth.refreshSession();
      const currentSession =
        refreshData.session ?? (await supabase.auth.getSession()).data.session ?? session;
      if (!currentSession?.access_token) {
        toast.dismiss(toastId);
        toast.error('로그인이 만료되었습니다.');
        setSyncing(false);
        return;
      }
      const res = await fetch('/api/admin/realtors/sync-last-sign-in', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(currentSession),
      });
      toast.dismiss(toastId);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? '동기화 실패');
      }
      const result = (await res.json()) as { synced: number; total: number };
      toast.success(`${result.synced}/${result.total}명 동기화 완료`);
      refetch();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(getErrorMessage(err) || '동기화 중 오류');
    } finally {
      setSyncing(false);
    }
  };

  const handleNotifyInactive = async () => {
    setNotifying(true);
    const toastId = toast.loading('미활동 중개사에게 알림 발송 중...');
    try {
      const supabase = getSupabase();
      const { data: refreshData } = await supabase.auth.refreshSession();
      const currentSession =
        refreshData.session ?? (await supabase.auth.getSession()).data.session ?? session;
      if (!currentSession?.access_token) {
        toast.dismiss(toastId);
        toast.error('로그인이 만료되었습니다.');
        setNotifying(false);
        return;
      }
      const res = await fetch('/api/admin/realtors/inactive/notify', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(currentSession),
        body: JSON.stringify({ inactiveDays: 14, channel: 'both' }),
      });
      toast.dismiss(toastId);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? '발송 실패');
      }
      const result = (await res.json()) as { sent: { sms: number; push: number }; total: number };
      toast.success(`${result.total}명 중 SMS ${result.sent.sms}건, 푸시 ${result.sent.push}건 발송`);
      refetch();
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(getErrorMessage(err) || '알림 발송 중 오류');
    } finally {
      setNotifying(false);
    }
  };

  const handleInvite = async () => {
    const phone = invitePhone.replace(/\D/g, '');
    if (!phone || phone.length < 10) {
      toast.error('올바른 휴대폰 번호를 입력하세요.');
      return;
    }
    setInviteSending(true);
    const toastId = toast.loading('초대 문자 발송 중...');
    try {
      const supabase = getSupabase();
      const { data: refreshData } = await supabase.auth.refreshSession();
      const currentSession =
        refreshData.session ?? (await supabase.auth.getSession()).data.session ?? session;
      if (!currentSession?.access_token) {
        toast.dismiss(toastId);
        toast.error('로그인이 만료되었습니다.');
        setInviteSending(false);
        return;
      }
      const res = await fetch('/api/admin/realtors/invite', {
        method: 'POST',
        credentials: 'include',
        headers: { ...getAuthHeaders(currentSession), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: invitePhone,
          name: inviteName || undefined,
          referrer_realtor_id: inviteReferrerId || undefined,
        }),
      });
      toast.dismiss(toastId);
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? '발송 실패');
      }
      const result = (await res.json()) as { smsSent?: boolean; message?: string };
      toast.success(result.message ?? '초대 문자가 발송되었습니다.');
      setInviteModalOpen(false);
      setInvitePhone('');
      setInviteName('');
      setInviteReferrerId('');
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(getErrorMessage(err) || '초대 발송 중 오류');
    } finally {
      setInviteSending(false);
    }
  };

  const loadErrorMsg =
    loadError != null
      ? (() => {
          const rawMsg = getTimeoutFriendlyMessage(loadError) || getErrorMessage(loadError);
          return rawMsg === 'Supabase가 설정되지 않았습니다.'
            ? 'Supabase 환경변수를 확인해 주세요.'
            : rawMsg;
        })()
      : null;

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedIds([]);
    } else {
      setSelectedIds(realtors.map((r) => r.id));
    }
    setSelectAll(!selectAll);
  };

  const handleSelect = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((i) => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkQRGenerate = async () => {
    const ids = selectedIds.length > 0 ? selectedIds : realtors.map((r) => r.id);
    if (ids.length === 0) {
      toast.error(
        realtors.length === 0
          ? '공인중개사 목록이 비어 있습니다. 검색·필터 조건을 완화하거나 먼저 공인중개사를 등록해 주세요.'
          : '선택된 항목이 없습니다. QR코드를 생성할 공인중개사를 선택해 주세요.'
      );
      return;
    }
    setQrGenerating(true);
    const toastId = toast.loading(`QR코드 생성 중... (총 ${ids.length}건)`);
    try {
      // 만료된 토큰으로 API 호출 시 401 방지: 항상 세션 갱신 후 최신 토큰 사용
      const supabase = getSupabase();
      const { data: refreshData } = await supabase.auth.refreshSession();
      const currentSession =
        refreshData.session ?? (await supabase.auth.getSession()).data.session ?? session;
      if (!currentSession?.access_token) {
        toast.dismiss(toastId);
        toast.error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        setQrGenerating(false);
        return;
      }
      const res = await fetch('/api/admin/generate-qr', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(currentSession),
        body: JSON.stringify({ realtorIds: ids }),
      });

      toast.dismiss(toastId);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(errBody.error ?? `서버 오류 (${res.status})`);
      }

      const result = await res.json() as { success: string[]; failed: string[]; total: number };

      if (result.failed.length > 0) {
        toast.error(`성공 ${result.success.length}건, 실패 ${result.failed.length}건`);
      } else {
        toast.success(`${result.success.length}건 QR코드 생성 완료`);
      }
      refetch();
    } catch (err) {
      toast.dismiss(toastId);
      logger.error('QR코드 일괄 생성 오류', err);
      toast.error(getErrorMessage(err) || 'QR코드 생성 중 오류가 발생했습니다.');
    } finally {
      setQrGenerating(false);
    }
  };

  const handleBulkStatusChange = async () => {
    const ids = selectedIds.length > 0 ? selectedIds : realtors.map((r) => r.id);
    if (ids.length === 0) {
      toast.error('선택된 항목이 없습니다. 상태를 변경할 공인중개사를 선택해 주세요.');
      return;
    }
    setBulkStatusChanging(true);
    const toastId = toast.loading(`상태 변경 중... (${ids.length}건)`);
    try {
      const supabase = getSupabase();
      const { data: refreshData } = await supabase.auth.refreshSession();
      const currentSession =
        refreshData.session ?? (await supabase.auth.getSession()).data.session ?? session;
      if (!currentSession?.access_token) {
        toast.dismiss(toastId);
        toast.error('로그인이 만료되었습니다. 다시 로그인해 주세요.');
        setBulkStatusChanging(false);
        return;
      }
      const res = await fetch('/api/admin/realtors/bulk-status', {
        method: 'POST',
        credentials: 'include',
        headers: getAuthHeaders(currentSession),
        body: JSON.stringify({ realtorIds: ids, status: bulkStatusValue }),
      });
      toast.dismiss(toastId);
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(errBody.error ?? `서버 오류 (${res.status})`);
      }
      const result = (await res.json()) as { updated: number; status: string };
      toast.success(`${result.updated}건 상태를 "${bulkStatusValue === 'active' ? '활성' : bulkStatusValue === 'inactive' ? '비활성' : '정지'}"로 변경했습니다.`);
      refetch();
    } catch (err) {
      toast.dismiss(toastId);
      logger.error('일괄 상태변경 오류', err);
      toast.error(getErrorMessage(err) || '상태 변경 중 오류가 발생했습니다.');
    } finally {
      setBulkStatusChanging(false);
    }
  };

  const handleExcelDownload = async () => {
    if (!user?.id) {
      alert('로그인이 필요합니다.');
      return;
    }
    if (excelDownloading) return;
    setExcelDownloading(true);
    try {
      const ids = selectedIds.length > 0 ? selectedIds : undefined;
      const data = await withTimeout(
        realtorListService.getForExport(ids),
        EXCEL_FETCH_TIMEOUT_MS
      );
      if (!data || data.length === 0) {
        alert('다운로드할 데이터가 없습니다.');
        return;
      }
      await exportRealtors(data);
      const idsToMark = ids || data.map((r) => r.id);
      await realtorListService.markExcelDownloaded(idsToMark, user.id);
      toast.success('엑셀 다운로드가 완료되었습니다.');
      refetch();
    } catch (err) {
      logger.error('엑셀 다운로드 오류', err);
      const msg = getTimeoutFriendlyMessage(err) || getErrorMessage(err);
      toast.error(msg || '다운로드 중 오류가 발생했습니다.');
    } finally {
      setExcelDownloading(false);
    }
  };

  return (
    <AdminLayout>
      <div className="min-h-[80vh] bg-slate-50/60">
        {/* 헤더 — 그라데이션 + 타이틀 */}
        <div className="rounded-2xl bg-white border border-slate-200/80 shadow-sm overflow-hidden mb-6">
          <div className="bg-gradient-to-br from-brand-600 via-brand-600 to-brand-700 px-6 py-8 sm:px-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white/15 text-white">
                  <Users className="h-6 w-6" aria-hidden />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-white tracking-tight">
                    공인중개사 관리
                  </h1>
                  <p className="mt-0.5 text-sm text-brand-100">
                    총 <span className="font-semibold text-white">{total}</span>명 등록
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={handleBulkQRGenerate}
                  disabled={qrGenerating || loading}
                  className="bg-white/15 text-white border-white/30 hover:bg-white/25 hover:text-white"
                >
                  <QrCode className="h-4 w-4 mr-2" />
                  {qrGenerating ? '생성 중...' : 'QR코드 생성'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setInviteModalOpen(true)}
                  className="bg-white/15 text-white border-white/30 hover:bg-white/25 hover:text-white"
                >
                  <Send className="h-4 w-4 mr-2" />
                  공인중개사 초대
                </Button>
                <Button
                  variant="secondary"
                  onClick={handleExcelDownload}
                  disabled={excelDownloading}
                  className="bg-white text-brand-600 hover:bg-brand-50 border-0"
                >
                  <Download className={`h-4 w-4 mr-2 ${excelDownloading ? 'animate-pulse' : ''}`} />
                  {excelDownloading ? '다운로드 중...' : '엑셀 다운로드'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {loadErrorMsg && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-6 flex items-center justify-between gap-4">
            <span>{loadErrorMsg} 아래 [새로고침]으로 다시 시도할 수 있습니다.</span>
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1" />
              새로고침
            </Button>
          </div>
        )}

        {/* 필터 카드 — Tailwind 전용 */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden mb-6">
          <div className="p-4 sm:p-5">
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400 pointer-events-none" aria-hidden />
                <input
                  type="text"
                  placeholder="업체명, 담당자, 연락처, 주소 검색..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 transition-colors"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <select
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 w-36"
                  value={statusFilter}
                  onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
                >
                  <option value="">상태 전체</option>
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                  <option value="suspended">정지</option>
                </select>
                <select
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 w-36"
                  value={verifiedFilter}
                  onChange={(e) => { setVerifiedFilter(e.target.value); setPage(1); }}
                >
                  <option value="">계좌인증 전체</option>
                  <option value="true">인증완료</option>
                  <option value="false">미인증</option>
                </select>
                <select
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 w-44"
                  value={excelFilter}
                  onChange={(e) => { setExcelFilter(e.target.value); setPage(1); }}
                >
                  <option value="">엑셀 다운로드 전체</option>
                  <option value="not_downloaded">엑셀 미다운로드만</option>
                </select>
                <select
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500 w-44"
                  value={inactiveFilter}
                  onChange={(e) => { setInactiveFilter(e.target.value); setPage(1); }}
                >
                  <option value="">활동 여부 전체</option>
                  <option value="14">2주 이상 미활동</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {inactiveFilter === '14' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 mb-6">
            <span className="text-sm font-medium text-amber-800">
              2주 이상 미활동 중개사 {total}명 (마지막 로그인 기준)
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleSyncLastSignIn}
                disabled={syncing || loading}
              >
                <Database className="h-4 w-4 mr-1" />
                {syncing ? '동기화 중...' : '로그인 시각 동기화'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleNotifyInactive}
                disabled={notifying || loading || total === 0}
              >
                <Bell className="h-4 w-4 mr-1" />
                {notifying ? '발송 중...' : 'SMS·푸시 알림 발송'}
              </Button>
            </div>
          </div>
        )}

        {selectedIds.length > 0 && (
          <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 flex flex-wrap items-center justify-between gap-3 mb-6">
            <span className="text-sm font-medium text-brand-800">{selectedIds.length}개 항목 선택됨</span>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-600">일괄 상태변경:</span>
              <select
                value={bulkStatusValue}
                onChange={(e) => setBulkStatusValue(e.target.value as 'active' | 'inactive' | 'suspended')}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-500/25"
              >
                <option value="active">활성</option>
                <option value="inactive">비활성</option>
                <option value="suspended">정지</option>
              </select>
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkStatusChange}
                disabled={bulkStatusChanging}
              >
                {bulkStatusChanging ? '적용 중...' : '적용'}
              </Button>
              <Button variant="primary" size="sm" onClick={handleExcelDownload}>
                선택 항목 다운로드
              </Button>
            </div>
          </div>
        )}

        {/* 테이블 카드 — Tailwind 전용, 레거시 클래스 제거 */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="h-9 w-9 animate-spin text-brand-500" aria-hidden />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead>
                    <tr className="bg-slate-50">
                      <th scope="col" className="w-12 px-4 py-3.5 text-left">
                        <input
                          type="checkbox"
                          checked={selectAll}
                          onChange={handleSelectAll}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">업체명</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">주소지</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">담당자</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">연락처</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">QR코드</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">추천인</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">엑셀</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">마지막 로그인</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">가입일</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">계좌인증</th>
                      <th scope="col" className="px-4 py-3.5 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">상태</th>
                      <th scope="col" className="w-20 px-4 py-3.5 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">상세</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {realtors.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="px-4 py-12 text-center text-slate-500 text-sm">
                          등록된 공인중개사가 없습니다
                        </td>
                      </tr>
                    ) : (
                      realtors.map((realtor) => (
                        <tr
                          key={realtor.id}
                          className="hover:bg-slate-50/80 transition-colors"
                        >
                          <td className="px-4 py-3.5">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(realtor.id)}
                              onChange={() => handleSelect(realtor.id)}
                              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            />
                          </td>
                          <td className="px-4 py-3.5">
                            <span className="font-medium text-slate-900">{realtor.business_name}</span>
                          </td>
                          <td className="max-w-[200px] truncate px-4 py-3.5 text-sm text-slate-600" title={realtor.address || undefined}>
                            {realtor.address || '-'}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-700">{realtor.contact_name || '-'}</td>
                          <td className="px-4 py-3.5 text-sm text-slate-700">{realtor.contact_phone || '-'}</td>
                          <td className="px-4 py-3.5">
                            {realtor.qr_code_url ? (
                              <a
                                href={realtor.qr_code_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex text-brand-600 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 rounded-lg p-1"
                              >
                                <QrCode className="h-5 w-5" />
                              </a>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-600">
                            {realtor.referrer
                              ? (realtor.referrer.business_name || realtor.referrer.contact_name || '-')
                              : '-'}
                          </td>
                          <td className="px-4 py-3.5">
                            {realtor.last_excel_downloaded_at ? (
                              <div className="flex flex-col gap-0.5">
                                <StatusBadge label="다운로드 완료" variant="green" />
                                <span className="text-xs text-slate-500">
                                  {new Date(realtor.last_excel_downloaded_at).toLocaleDateString('ko-KR')}
                                </span>
                              </div>
                            ) : (
                              <StatusBadge label="미다운로드" variant="gray" />
                            )}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-500">
                            {realtor.user?.last_sign_in_at
                              ? new Date(realtor.user.last_sign_in_at).toLocaleDateString('ko-KR', {
                                  year: 'numeric',
                                  month: 'short',
                                  day: 'numeric',
                                })
                              : '미기록'}
                          </td>
                          <td className="px-4 py-3.5 text-sm text-slate-500">
                            {new Date(realtor.created_at).toLocaleDateString('ko-KR')}
                          </td>
                          <td className="px-4 py-3.5">
                            {realtor.account_verified ? (
                              <StatusBadge label="인증완료" variant="green" />
                            ) : (
                              <StatusBadge label="미인증" variant="gray" />
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <StatusBadge status={realtor.user?.status ?? ''} type="user" />
                          </td>
                          <td className="px-4 py-3.5 text-right">
                            <a
                              href={`/members/realtors/${realtor.id}`}
                              className="inline-flex items-center justify-center w-9 h-9 rounded-lg text-brand-600 hover:bg-brand-50 hover:text-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 transition-colors"
                            >
                              <Eye className="h-5 w-5" />
                            </a>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="px-4 py-4 sm:px-6 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-sm text-slate-500">
                    총 {total}건 중 {(page - 1) * 20 + 1}–{Math.min(page * 20, total)}건
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      className="min-w-[2.25rem]"
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
                          className="min-w-[2.25rem]"
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
                      className="min-w-[2.25rem]"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 공인중개사 초대 모달 */}
      {inviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => !inviteSending && setInviteModalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-slate-900 mb-4">공인중개사 초대</h2>
            <p className="text-sm text-slate-500 mb-4">
              휴대폰 번호를 입력하면 초대 문자가 발송됩니다. 가입 시 추천인을 지정하면 자동 등록됩니다.
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">휴대폰 번호 *</label>
                <input
                  type="tel"
                  placeholder="01012345678"
                  value={invitePhone}
                  onChange={(e) => setInvitePhone(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">이름 (선택)</label>
                <input
                  type="text"
                  placeholder="홍길동"
                  value={inviteName}
                  onChange={(e) => setInviteName(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">추천인 (선택)</label>
                <select
                  value={inviteReferrerId}
                  onChange={(e) => setInviteReferrerId(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/25 focus:border-brand-500"
                >
                  <option value="">추천인 없음</option>
                  {realtors.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.business_name || r.contact_name || r.id.slice(0, 8)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-6 flex gap-2 justify-end">
              <Button variant="secondary" onClick={() => !inviteSending && setInviteModalOpen(false)} disabled={inviteSending}>
                취소
              </Button>
              <Button variant="primary" onClick={handleInvite} disabled={inviteSending}>
                {inviteSending ? '발송 중...' : '초대 문자 발송'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
