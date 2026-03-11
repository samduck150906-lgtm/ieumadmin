'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Check,
  X,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Wallet,
  AlertCircle,
  CheckCircle,
  Clock,
  Ban,
  Download,
  FileText,
  ExternalLink,
  Receipt,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuth } from '@/lib/auth';
import { getErrorMessage, logger } from '@/lib/logger';
import { withTimeout, DATA_FETCH_TIMEOUT_MS, EXCEL_FETCH_TIMEOUT_MS, getTimeoutFriendlyMessage } from '@/lib/timeout';
import { showError, showSuccess } from '@/lib/toast';
import {
  getWithdrawalRequests,
  getWithdrawalById,
  getWithdrawalStats,
} from '@/lib/api/settlements';
import { exportWithdrawals } from '@/lib/excel';
import { WithdrawalStatus } from '@/types/database';

type StatusKey = 'requested' | 'approved' | 'completed' | 'rejected';

const statusConfig: Record<StatusKey, { label: string; variant: 'yellow' | 'blue' | 'green' | 'red'; icon: typeof Clock }> = {
  requested: { label: '신청', variant: 'yellow', icon: Clock },
  approved: { label: '승인', variant: 'blue', icon: CheckCircle },
  completed: { label: '완료', variant: 'green', icon: Check },
  rejected: { label: '반려', variant: 'red', icon: Ban },
};

const FILTER_CHIPS: { value: string; label: string }[] = [
  { value: '', label: '전체' },
  { value: 'requested', label: '신청' },
  { value: 'approved', label: '승인' },
  { value: 'completed', label: '완료' },
  { value: 'rejected', label: '반려' },
];

export default function SettlementsPage() {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [stats, setStats] = useState({
    requestedCount: 0,
    requestedAmount: 0,
    approvedCount: 0,
    approvedAmount: 0,
    completedCount: 0,
    completedAmount: 0,
    totalAmount: 0,
  });

  const [receivableStats, setReceivableStats] = useState<{
    totalAmount: number;
    totalCount: number;
    partnerCount: number;
    lastMonthAmount: number;
    lastMonthCount: number;
    thisMonthAmount: number;
    thisMonthCount: number;
  } | null>(null);

  /** 업체별 미수금 리스트 — 누가 얼마를 내야 하는지 */
  const [receivablesByPartner, setReceivablesByPartner] = useState<Array<{
    partner_id: string;
    business_name: string;
    unpaid_amount: number;
    unpaid_count: number;
  }>>([]);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [detailModal, setDetailModal] = useState<{ id: string; data: any } | null>(null);
  const [openingDocKey, setOpeningDocKey] = useState<string | null>(null);

  const handleExcelDownload = async () => {
    if (excelDownloading) return;
    setExcelDownloading(true);
    try {
      const result = await withTimeout(
        getWithdrawalRequests({
          search: searchTerm || undefined,
          status: statusFilter as WithdrawalStatus || undefined,
          page: 1,
          limit: 9999,
        }),
        EXCEL_FETCH_TIMEOUT_MS
      );
      const data = result.data || [];
      if (data.length === 0) {
        showError('다운로드할 데이터가 없습니다.');
        return;
      }
      await exportWithdrawals(data);
      showSuccess('다운로드되었습니다.');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('출금 신청 엑셀 다운로드 오류', e);
      const friendly = getTimeoutFriendlyMessage(e);
      showError(msg.includes('schema cache') ? 'DB 테이블이 적용되지 않았을 수 있습니다. Supabase 마이그레이션을 실행해 주세요.' : friendly || '다운로드 중 오류가 발생했습니다.');
    } finally {
      setExcelDownloading(false);
    }
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [result, statsData] = await withTimeout(
        Promise.all([
          getWithdrawalRequests({
            search: searchTerm || undefined,
            status: statusFilter as WithdrawalStatus || undefined,
            page,
            limit: 20,
          }),
          getWithdrawalStats(),
        ]),
        DATA_FETCH_TIMEOUT_MS
      );
      setWithdrawals(result.data || []);
      setTotal(result.total);
      setTotalPages(Math.ceil(result.total / 20));
      setStats(statsData);
    } catch (error) {
      logger.error('정산 데이터 로드 오류', error);
      const friendly = getTimeoutFriendlyMessage(error);
      const msg = error instanceof Error ? error.message : '정산 데이터를 불러오지 못했습니다.';
      setLoadError(msg.includes('schema cache') ? 'DB 테이블이 적용되지 않았을 수 있습니다. Supabase 마이그레이션을 실행해 주세요.' : friendly || msg);
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, page]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
    setSelectedIds([]);
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (!session?.access_token) return;
    fetch('/api/admin/receivables-stats', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data == null) return;
        setReceivableStats({
          totalAmount: data.totalAmount ?? 0,
          totalCount: data.totalCount ?? 0,
          partnerCount: data.partnerCount ?? 0,
          lastMonthAmount: data.lastMonthAmount ?? 0,
          lastMonthCount: data.lastMonthCount ?? 0,
          thisMonthAmount: data.thisMonthAmount ?? 0,
          thisMonthCount: data.thisMonthCount ?? 0,
        });
      })
      .catch(() => {
        showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      });
    fetch('/api/admin/receivables-by-partner', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((res) => setReceivablesByPartner(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {
        setReceivablesByPartner([]);
        showError('데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      });
  }, [session?.access_token]);

  const formatMoney = (amount: number) => {
    return new Intl.NumberFormat('ko-KR').format(amount) + '원';
  };

  const authHeaders = (): HeadersInit => ({
    'Content-Type': 'application/json',
    ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
  });

  const handleApiResponse = async (res: Response): Promise<void> => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || res.statusText || '요청 실패');
  };

  const handleApprove = async (id: string) => {
    if (!user || !confirm('승인하시겠습니까?')) return;
    try {
      const res = await fetch('/api/withdrawals/approve', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id }),
      });
      await handleApiResponse(res);
      showSuccess('승인되었습니다.');
      loadData();
    } catch (e) {
      showError('승인 실패: ' + getErrorMessage(e));
    }
  };

  const handleComplete = async (id: string) => {
    if (!user || !confirm('출금 완료 처리하시겠습니까?')) return;
    try {
      const res = await fetch('/api/withdrawals/complete', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id }),
      });
      await handleApiResponse(res);
      showSuccess('완료 처리되었습니다.');
      loadData();
    } catch (e) {
      showError('완료 처리 실패: ' + getErrorMessage(e));
    }
  };

  const handleReject = async () => {
    if (!rejectTarget || !user || !rejectReason) return;
    try {
      const res = await fetch('/api/withdrawals/reject', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ id: rejectTarget, reason: rejectReason }),
      });
      await handleApiResponse(res);
      setShowRejectModal(false);
      setRejectReason('');
      setRejectTarget(null);
      showSuccess('반려 처리되었습니다.');
      loadData();
    } catch (e) {
      showError('반려 실패: ' + getErrorMessage(e));
    }
  };

  const handleBulkApprove = async () => {
    if (!user || selectedIds.length === 0) return;
    if (!confirm(`${selectedIds.length}건을 일괄 승인하시겠습니까?`)) return;
    try {
      for (const id of selectedIds) {
        const res = await fetch('/api/withdrawals/approve', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ id }),
        });
        await handleApiResponse(res);
      }
      setSelectedIds([]);
      showSuccess('일괄 승인되었습니다.');
      loadData();
    } catch (e) {
      showError('일괄 승인 실패: ' + getErrorMessage(e));
    }
  };

  const handleBulkComplete = async () => {
    if (!user || selectedIds.length === 0) return;
    if (!confirm(`${selectedIds.length}건을 일괄 완료 처리하시겠습니까?`)) return;
    try {
      for (const id of selectedIds) {
        const res = await fetch('/api/withdrawals/complete', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ id }),
        });
        await handleApiResponse(res);
      }
      setSelectedIds([]);
      showSuccess('일괄 완료 처리되었습니다.');
      loadData();
    } catch (e) {
      showError('일괄 완료 실패: ' + getErrorMessage(e));
    }
  };

  const openDetail = async (id: string) => {
    try {
      const data = await getWithdrawalById(id);
      setDetailModal({ id, data });
    } catch (e) {
      logger.error('출금 상세 조회 오류', e);
      showError('상세 조회 실패');
    }
  };

  const openDocUrl = async (realtorId: string, key: 'id_card_url' | 'bankbook_url' | 'business_license_url') => {
    setOpeningDocKey(key);
    try {
      const res = await fetch(`/api/realtors/${realtorId}/document-urls`);
      if (!res.ok) throw new Error('URL 발급 실패');
      const urls = await res.json();
      const url = urls[key];
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      } else {
        showError('해당 서류의 URL을 가져오지 못했습니다.');
      }
    } catch {
      showError('서류 URL 발급에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setOpeningDocKey(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === withdrawals.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(withdrawals.map((w: any) => w.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">정산 관리</h1>
            <p className="mt-1 text-sm text-gray-500">출금 신청 및 정산 처리</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleExcelDownload} variant="secondary" disabled={excelDownloading}>
              <Download className={`h-4 w-4 mr-2 ${excelDownloading ? 'animate-pulse' : ''}`} />
              {excelDownloading ? '다운로드 중...' : '엑셀 다운로드'}
            </Button>
            <Button onClick={loadData} variant="secondary" disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              새로고침
            </Button>
          </div>
        </div>

        {/* 정산 기준 안내 */}
        <Card className="bg-amber-50 border-amber-200">
          <CardBody className="text-sm text-amber-800">
            <p className="font-medium mb-1">정산 기준</p>
            <ul className="list-disc list-inside space-y-0.5 text-amber-700">
              <li>출금 신청: 매월 20일부터 가능</li>
              <li>정산 기준: 전월 1일 ~ 말일 발생 매출</li>
              <li>계좌 미인증 시 출금 불가 (인증 후 신청 가능)</li>
              <li>개인: 원천세 3.3% 공제 후 실지급액 · 사업자: 부가세 10% 세금계산서 발행</li>
              <li>추천인 수익 5%: 피추천인의 상담요청 + 전체완료 수수료의 5%, 가입일로부터 1년간 유효</li>
              <li>원천세/부가세 내역서: 아래 &quot;엑셀 다운로드&quot; 시 출금신청 회원 기준 계좌 유형(개인/사업자) 및 원천세·부가세 구분이 포함됩니다. (계산서 발행·원천세 신고 자동화는 개발 협의)</li>
            </ul>
          </CardBody>
        </Card>

        {/* 미수: 총액·업체 수·전월·당월 — 클릭 시 업체별 미수 리스트 → 결제요청(카드/이체) */}
        {receivableStats != null && (
          <Card className="border-amber-200 bg-amber-50/50 overflow-hidden">
            <CardBody className="p-0">
              <Link href="/payments/receivables" className="block hover:bg-amber-100/40 transition-colors">
                <div className="flex flex-row items-center gap-3 px-5 py-4 border-b border-amber-200/60">
                  <div className="p-3 bg-amber-100 rounded-lg shrink-0">
                    <Receipt className="h-6 w-6 text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-gray-600">미수 현황 (클릭 시 업체별 미수 리스트·결제요청)</p>
                    <p className="text-xs text-gray-500 mt-0.5">당월 미수는 결제 후에도 당월로 남으며, 선택 청구 후 결제요청 가능</p>
                  </div>
                  <span className="text-primary-600 font-medium text-sm shrink-0">업체별 미수 →</span>
                </div>
              </Link>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 px-5 py-4">
                <Link href="/payments/receivables" className="rounded-xl border border-amber-200/80 bg-white/80 p-4 hover:bg-amber-50 transition-colors">
                  <p className="text-xs text-gray-500">총 미수 금액</p>
                  <p className="text-lg font-bold text-amber-800 mt-0.5">{formatMoney(receivableStats.totalAmount)}</p>
                  <p className="text-xs text-gray-500 mt-1">{receivableStats.totalCount}건</p>
                </Link>
                <Link href="/payments/receivables" className="rounded-xl border border-amber-200/80 bg-white/80 p-4 hover:bg-amber-50 transition-colors">
                  <p className="text-xs text-gray-500">미수 업체 수</p>
                  <p className="text-lg font-bold text-amber-800 mt-0.5">{receivableStats.partnerCount}개</p>
                </Link>
                <Link href="/payments/receivables?filter=lastMonth" className="rounded-xl border border-amber-200/80 bg-white/80 p-4 hover:bg-amber-50 transition-colors">
                  <p className="text-xs text-gray-500">전월 미수 금액</p>
                  <p className="text-lg font-bold text-amber-800 mt-0.5">{formatMoney(receivableStats.lastMonthAmount)}</p>
                  <p className="text-xs text-gray-500 mt-1">{receivableStats.lastMonthCount}건</p>
                </Link>
                <Link href="/payments/receivables?filter=thisMonth" className="rounded-xl border border-amber-200/80 bg-white/80 p-4 hover:bg-amber-50 transition-colors">
                  <p className="text-xs text-gray-500">당월 미수 금액</p>
                  <p className="text-lg font-bold text-amber-800 mt-0.5">{formatMoney(receivableStats.thisMonthAmount)}</p>
                  <p className="text-xs text-gray-500 mt-1">{receivableStats.thisMonthCount}건</p>
                </Link>
              </div>
              {/* 누가 얼마를 내야 하는지 — 업체별 미수금 리스트 (미수 0건이어도 섹션 표시로 정산 가시화 유지) */}
              <div className="border-t border-amber-200/60 px-5 py-4">
                <p className="text-sm font-semibold text-gray-700 mb-3">업체별 미수금 (누가 얼마를 내야 하는지)</p>
                {receivablesByPartner.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-amber-200/60 text-left text-gray-500">
                            <th className="py-2 pr-4">업체명</th>
                            <th className="py-2 pr-4 text-right">미결제 금액</th>
                            <th className="py-2 text-right">건수</th>
                            <th className="py-2 pl-2 w-20" aria-hidden />
                          </tr>
                        </thead>
                        <tbody>
                          {receivablesByPartner.map((row) => (
                            <tr key={row.partner_id} className="border-b border-amber-100">
                              <td className="py-2 pr-4 font-medium text-gray-900">{row.business_name}</td>
                              <td className="py-2 pr-4 text-right font-semibold text-amber-800">{formatMoney(row.unpaid_amount)}</td>
                              <td className="py-2 text-right text-gray-600">{row.unpaid_count}건</td>
                              <td className="py-2 pl-2">
                                <Link
                                  href={`/payments/receivables?partnerId=${encodeURIComponent(row.partner_id)}`}
                                  className="text-primary-600 hover:underline text-xs font-medium"
                                >
                                  상세 →
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <Link href="/payments/receivables">
                        <Button variant="secondary" size="sm">전체 미수 리스트 · 선택 청구</Button>
                      </Link>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-gray-500 py-4">현재 미수 건이 없습니다. 예약완료·전체완료 건 발생 시 미수가 자동 생성됩니다.</p>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {/* 통계 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">대기 중</p>
                <p className="text-xl font-bold">{stats.requestedCount}건</p>
                <p className="text-sm text-gray-500">{formatMoney(stats.requestedAmount)}</p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <CheckCircle className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">승인됨</p>
                <p className="text-xl font-bold">{stats.approvedCount}건</p>
                <p className="text-sm text-gray-500">{formatMoney(stats.approvedAmount)}</p>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Wallet className="h-6 w-6 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">출금 완료</p>
                <p className="text-xl font-bold">{stats.completedCount}건</p>
                <p className="text-sm text-gray-500">{formatMoney(stats.completedAmount)}</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {loadError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-red-800">{loadError}</p>
            <Button variant="secondary" size="sm" onClick={() => loadData()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              다시 시도
            </Button>
          </div>
        )}

        {/* 필터: 검색 + 필터 칩 */}
        <Card>
          <CardBody className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="공인중개사 검색..."
                className="input pl-10"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {FILTER_CHIPS.map(({ value, label }) => (
                <button
                  key={value || 'all'}
                  onClick={() => {
                    setStatusFilter(value);
                    setPage(1);
                  }}
                  className={`
                    px-4 py-2 rounded-full text-sm font-medium transition-all
                    ${statusFilter === value
                      ? 'bg-primary-600 text-white shadow-md'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200'
                    }
                  `}
                >
                  {label}
                </button>
              ))}
            </div>
          </CardBody>
        </Card>

        {/* 전체 선택 (카드가 있을 때) */}
        {!loading && withdrawals.length > 0 && (
          <div className="flex items-center gap-3 text-sm">
            <button
              onClick={toggleSelectAll}
              className="text-primary-600 hover:text-primary-700 font-medium"
            >
              {selectedIds.length === withdrawals.length ? '선택 해제' : '전체 선택'}
            </button>
            <span className="text-gray-400">|</span>
            <span className="text-gray-500">이 페이지 {withdrawals.length}건</span>
          </div>
        )}

        {/* 일괄 액션 */}
        {selectedIds.length > 0 && (
          <div className="bg-primary-50 border border-primary-200 rounded-xl p-4 flex items-center justify-between">
            <span className="text-sm text-primary-700 font-medium">{selectedIds.length}건 선택됨</span>
            <div className="flex gap-2">
              <Button onClick={handleBulkApprove} variant="primary" size="sm">
                일괄 승인
              </Button>
              <Button onClick={handleBulkComplete} variant="secondary" size="sm">
                일괄 완료
              </Button>
            </div>
          </div>
        )}

        {/* 카드형 리스트 */}
        <div className="space-y-4">
          {loading ? (
            <Card>
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
              </div>
            </Card>
          ) : withdrawals.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                <Wallet className="h-12 w-12 text-slate-300 mb-3" />
                <p className="font-medium">출금 신청이 없습니다</p>
                <p className="text-sm mt-1">필터를 변경해보세요</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {withdrawals.map((w: any) => {
                const config = statusConfig[w.status as StatusKey] || statusConfig.requested;
                const Icon = config.icon;
                const isIndividual =
                  w.realtor?.account_type === 'individual' || !w.realtor?.account_type;
                const netAmount = isIndividual ? Math.floor(w.amount * 0.967) : w.amount;
                const accountVerified = w.realtor?.account_verified !== false;

                return (
                  <Card key={w.id} interactive className="flex flex-col">
                    <CardBody className="flex flex-col gap-4">
                      {/* 상단: 체크박스 + 상태 배지 */}
                      <div className="flex items-start justify-between gap-3">
                        <label className="flex items-center gap-2 cursor-pointer shrink-0">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(w.id)}
                            onChange={() => toggleSelect(w.id)}
                            className="rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-xs text-gray-500">
                            {new Date(w.created_at).toLocaleDateString('ko-KR')}
                          </span>
                        </label>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Icon className={`h-3.5 w-3.5 ${
                            config.variant === 'yellow' ? 'text-amber-600' :
                            config.variant === 'blue' ? 'text-blue-600' :
                            config.variant === 'green' ? 'text-green-600' : 'text-red-600'
                          }`} />
                          <StatusBadge label={config.label} variant={config.variant} />
                        </div>
                      </div>

                      {/* 중개사 정보 */}
                      <div>
                        <div className="font-semibold text-slate-800 truncate">
                          {w.realtor?.business_name || '-'}
                        </div>
                        <div className="text-sm text-gray-500 mt-0.5">
                          {w.realtor?.contact_name}
                        </div>
                        {!accountVerified && (
                          <span className="inline-block mt-1 text-xs text-red-600 font-medium">
                            계좌 미인증
                          </span>
                        )}
                      </div>

                      {/* 금액 */}
                      <div className="flex items-baseline justify-between gap-2 py-2 border-y border-slate-200">
                        <div>
                          <p className="text-xs text-gray-500">신청 금액</p>
                          <p className="font-bold text-lg text-slate-800">{formatMoney(w.amount)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs text-gray-500">실지급액</p>
                          <p className="font-semibold text-slate-700">
                            {isIndividual ? (
                              <>
                                {formatMoney(netAmount)}
                                <span className="text-gray-400 text-xs block">원천세 3.3% 공제</span>
                              </>
                            ) : (
                              <>
                                {formatMoney(w.amount)}
                                <span className="text-gray-400 text-xs block">사업자</span>
                              </>
                            )}
                          </p>
                        </div>
                      </div>

                      {/* 계좌정보 */}
                      <div className="text-sm text-gray-600">
                        <p>{w.bank_name} {w.account_number}</p>
                        <p className="text-gray-500">{w.account_holder}</p>
                      </div>

                      {w.reject_reason && (
                        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                          {w.reject_reason}
                        </div>
                      )}

                      {/* 액션 버튼 */}
                      <div className="flex gap-2 flex-wrap mt-auto pt-2">
                        <Button
                          onClick={() => openDetail(w.id)}
                          variant="secondary"
                          size="sm"
                          title="상세/첨부서류"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          상세
                        </Button>
                        {w.status === 'requested' && (
                          <>
                            <Button onClick={() => handleApprove(w.id)} variant="primary" size="sm" title="승인">
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={() => {
                                setRejectTarget(w.id);
                                setShowRejectModal(true);
                              }}
                              variant="secondary"
                              size="sm"
                              className="text-red-500 hover:bg-red-50"
                              title="반려"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </>
                        )}
                        {w.status === 'approved' && (
                          <Button onClick={() => handleComplete(w.id)} variant="primary" size="sm">
                            <Wallet className="h-3 w-3 mr-1" /> 완료
                          </Button>
                        )}
                      </div>
                    </CardBody>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 페이지네이션 */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between py-4 px-2">
              <div className="text-sm text-gray-500">총 {total}건</div>
              <div className="flex gap-2 items-center">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="inline-flex items-center justify-center px-3 py-2 text-sm rounded-lg bg-slate-100 text-slate-700 font-medium min-w-[80px]">
                  {page} / {totalPages}
                </span>
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
        </div>
      </div>

      {/* 상세(첨부서류) 모달 */}
      {detailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-xl">
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">출금 신청 상세 · 첨부서류</h2>
              <button
                onClick={() => setDetailModal(null)}
                className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <p className="text-sm text-gray-500">신청자</p>
                <p className="font-medium">
                  {detailModal.data?.realtor?.business_name} · {detailModal.data?.realtor?.contact_name}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-500">금액</p>
                <p className="font-medium">{formatMoney(detailModal.data?.amount)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">계좌</p>
                <p>
                  {detailModal.data?.bank_name} {detailModal.data?.account_number} (
                  {detailModal.data?.account_holder})
                </p>
              </div>
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">첨부 서류</p>
                <div className="space-y-2">
                  {detailModal.data?.realtor?.id_card_url && (
                    <p>
                      <button
                        onClick={() => openDocUrl(detailModal.data!.realtor!.id, 'id_card_url')}
                        disabled={openingDocKey === 'id_card_url'}
                        className="text-primary-600 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        신분증 <ExternalLink className="h-3 w-3" />
                      </button>
                    </p>
                  )}
                  {detailModal.data?.realtor?.bankbook_url && (
                    <p>
                      <button
                        onClick={() => openDocUrl(detailModal.data!.realtor!.id, 'bankbook_url')}
                        disabled={openingDocKey === 'bankbook_url'}
                        className="text-primary-600 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        통장사본 <ExternalLink className="h-3 w-3" />
                      </button>
                    </p>
                  )}
                  {detailModal.data?.realtor?.business_license_url && (
                    <p>
                      <button
                        onClick={() => openDocUrl(detailModal.data!.realtor!.id, 'business_license_url')}
                        disabled={openingDocKey === 'business_license_url'}
                        className="text-primary-600 hover:underline inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        사업자등록증 <ExternalLink className="h-3 w-3" />
                      </button>
                    </p>
                  )}
                  {!detailModal.data?.realtor?.id_card_url &&
                    !detailModal.data?.realtor?.bankbook_url &&
                    !detailModal.data?.realtor?.business_license_url && (
                    <p className="text-gray-500 text-sm">첨부된 서류가 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 반려 모달 */}
      {showRejectModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-xl">
            <div className="p-6 border-b">
              <h2 className="text-lg font-bold flex items-center">
                <AlertCircle className="h-5 w-5 text-red-500 mr-2" />
                출금 반려
              </h2>
            </div>
            <div className="p-6">
              <label className="block text-sm font-medium text-gray-700 mb-2">반려 사유 *</label>
              <textarea
                className="input w-full h-24 resize-none"
                placeholder="반려 사유를 입력하세요"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
              />
            </div>
            <div className="flex gap-3 p-6 border-t">
              <Button
                onClick={() => {
                  setShowRejectModal(false);
                  setRejectReason('');
                  setRejectTarget(null);
                }}
                variant="secondary"
                className="flex-1"
              >
                취소
              </Button>
              <Button onClick={handleReject} disabled={!rejectReason} variant="danger" className="flex-1">
                반려하기
              </Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
