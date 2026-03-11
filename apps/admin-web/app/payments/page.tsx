'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Search, Plus, Check, RefreshCw, X, Wallet } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import toast from 'react-hot-toast';
import { useAuth } from '@/lib/auth';
import { getPaymentRequests, createPaymentRequest, completePaymentRequest, deletePaymentRequest, getPaymentStats, completePaymentRequestsBulk, deletePaymentRequestsBulk } from '@/lib/api/payments';
import { getPartners } from '@/lib/api/partners';
import type { PaymentStatus } from '@/types/database';
import { PaymentsTabs } from './PaymentsTabs';
import BulkActionBar, { BulkHeaderCheckbox, BulkCheckboxCell } from '@/components/BulkActionBar';

type StatusFilter = PaymentStatus | 'all';

const statusLabels: Record<string, string> = { requested: '요청', completed: '완료' };
const statusColors: Record<string, string> = { requested: 'badge-yellow', completed: 'badge-green' };

export default function PaymentsPage() {
  const { user, session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [stats, setStats] = useState({ requestedCount: 0, requestedAmount: 0, completedCount: 0, completedAmount: 0, thisMonthCount: 0, thisMonthAmount: 0, totalAmount: 0 });
  const [receivableStats, setReceivableStats] = useState<{ totalAmount: number; totalCount: number }>({ totalAmount: 0, totalCount: 0 });

  // 생성 모달
  const [showModal, setShowModal] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [newPayment, setNewPayment] = useState({ partnerId: '', amount: '', memo: '', paymentMethod: 'transfer' as 'card' | 'transfer' });
  const [submitting, setSubmitting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const status = statusFilter === 'all' ? undefined : statusFilter;
      const [result, statsData] = await Promise.all([
        getPaymentRequests({ status, page, limit: 20 }),
        getPaymentStats(),
      ]);
      setPayments(result.data || []);
      setTotal(result.total);
      setStats(statsData);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (!session?.access_token) return;
    fetch('/api/admin/receivables-stats', { headers: { Authorization: `Bearer ${session.access_token}` } })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setReceivableStats({ totalAmount: data?.totalAmount ?? 0, totalCount: data?.totalCount ?? 0 }))
      .catch(() => {
        toast.error('미수금 통계를 불러오지 못했습니다. 새로고침해 주세요.');
      });
  }, [session?.access_token]);

  const formatMoney = (n: number) => new Intl.NumberFormat('ko-KR').format(n) + '원';

  const handleOpenCreate = async () => {
    try {
      const result = await getPartners({ limit: 100 });
      setPartners(result.data || []);
    } catch {
      toast.error('업체 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
    }
    setShowModal(true);
  };

  const handleCreate = async () => {
    if (!newPayment.partnerId || !newPayment.amount || !user) return;
    setSubmitting(true);
    try {
      await createPaymentRequest(
        newPayment.partnerId,
        Number(newPayment.amount),
        newPayment.memo,
        user.id,
        newPayment.paymentMethod
      );
      toast.success('결제 요청이 생성되었습니다.');
      setShowModal(false);
      setNewPayment({ partnerId: '', amount: '', memo: '', paymentMethod: 'transfer' });
      loadData();
    } catch (e) { toast.error('생성 실패: ' + (e instanceof Error ? e.message : '오류')); }
    finally { setSubmitting(false); }
  };

  const handleComplete = async (id: string) => {
    if (!confirm('결제 완료 처리하시겠습니까?')) return;
    try { await completePaymentRequest(id); loadData(); toast.success('결제 완료 처리되었습니다.'); }
    catch (e) { toast.error('처리 실패: ' + (e instanceof Error ? e.message : '오류')); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('삭제하시겠습니까?')) return;
    try { await deletePaymentRequest(id); loadData(); toast.success('삭제되었습니다.'); }
    catch (e) { toast.error('삭제 실패: ' + (e instanceof Error ? e.message : '오류')); }
  };

  const requestedIds = payments.filter((p: any) => p.status === 'requested').map((p: any) => p.id);

  const handleBulkAction = async (action: string, ids: string[]) => {
    if (ids.length === 0) return;
    setBulkUpdating(true);
    try {
      if (action === 'complete') {
        const toComplete = ids.filter((id) => requestedIds.includes(id));
        if (toComplete.length === 0) {
          toast.error('요청 상태인 건만 일괄 완료할 수 있습니다.');
          return;
        }
        await completePaymentRequestsBulk(toComplete);
        toast.success(`${toComplete.length}건 결제 완료 처리되었습니다.`);
      } else if (action === 'delete') {
        const toDelete = ids.filter((id) => requestedIds.includes(id));
        if (toDelete.length === 0) {
          toast.error('요청 상태인 건만 일괄 삭제할 수 있습니다.');
          return;
        }
        if (!confirm(`선택한 ${toDelete.length}건(요청 상태)을 삭제하시겠습니까?`)) return;
        await deletePaymentRequestsBulk(toDelete);
        toast.success(`${toDelete.length}건 삭제되었습니다.`);
      }
      setSelected(new Set());
      loadData();
    } catch (e) {
      toast.error('일괄 처리 실패: ' + (e instanceof Error ? e.message : '오류'));
    } finally {
      setBulkUpdating(false);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PaymentsTabs activeTab="payments" />
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">결제 요청</h1>
          <Button onClick={handleOpenCreate} variant="primary">
            <Plus className="h-4 w-4 mr-2" />결제 요청
          </Button>
        </div>

        {loadError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-red-800">{loadError}</p>
            <Button variant="secondary" size="sm" onClick={() => loadData()}>
              <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
            </Button>
          </div>
        )}

        {/* 미수 총액 위젯 + 업체별 미수(바로 결제 진입) 링크 — 데이터 0/API 실패 시에도 항상 표시(요구사항·스크린샷 가독성) */}
        <Card className="border-amber-200 bg-amber-50/50">
            <CardBody className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <Wallet className="h-8 w-8 text-amber-600" />
                <div>
                  <p className="text-sm text-gray-600">미수 총액</p>
                  <p className="text-xl font-bold text-amber-800">
                    {formatMoney(receivableStats.totalAmount)} ({receivableStats.totalCount}건)
                  </p>
                </div>
              </div>
              <Link href="/payments/receivables">
                <Button variant="secondary" size="sm">업체별 미수 리스트 · 바로 결제 →</Button>
              </Link>
            </CardBody>
          </Card>

        <div className="flex gap-2">
          <Link href="/payments/settlement-history">
            <Button variant="secondary" size="sm">수익금 정산내역 (일별/월별)</Button>
          </Link>
        </div>

        {/* 통계 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardBody className="text-center">
              <p className="text-sm text-gray-500">요청 대기</p>
              <p className="text-2xl font-bold text-yellow-600">{stats.requestedCount}건</p>
              <p className="text-sm">{formatMoney(stats.requestedAmount)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <p className="text-sm text-gray-500">결제 완료</p>
              <p className="text-2xl font-bold text-green-600">{stats.completedCount}건</p>
              <p className="text-sm">{formatMoney(stats.completedAmount)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <p className="text-sm text-gray-500">이번달</p>
              <p className="text-2xl font-bold">{stats.thisMonthCount}건</p>
              <p className="text-sm">{formatMoney(stats.thisMonthAmount)}</p>
            </CardBody>
          </Card>
        </div>

        {/* 필터 */}
        <Card>
          <CardBody>
          <select className="input w-36" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}>
            <option value="all">상태 전체</option>
            <option value="requested">요청</option>
            <option value="completed">완료</option>
          </select>
          </CardBody>
        </Card>

        {payments.length > 0 && (
          <BulkActionBar
            totalCount={payments.length}
            selected={selected}
            allIds={payments.map((p: any) => p.id)}
            onSelectionChange={setSelected}
            loading={bulkUpdating}
            actions={[
              { label: '일괄 완료', value: 'complete', variant: 'success' },
              { label: '일괄 삭제 (요청 상태만)', value: 'delete', variant: 'danger' },
            ]}
            onAction={handleBulkAction}
          />
        )}

        {/* 테이블 */}
        <Card>
          {loading ? (
            <div className="flex items-center justify-center py-12"><RefreshCw className="h-8 w-8 animate-spin text-primary-600" /></div>
          ) : (
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <BulkHeaderCheckbox
                      allIds={payments.map((p: any) => p.id)}
                      selected={selected}
                      onSelectionChange={setSelected}
                      disabled={loading}
                    />
                    <th>업체명</th><th>금액</th><th>결제방법</th><th>메모</th><th>상태</th><th>요청일</th><th>액션</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.length === 0 ? (
                    <tr><td colSpan={8} className="text-center text-gray-500 py-8">결제 요청이 없습니다</td></tr>
                  ) : payments.map((p: any) => (
                    <tr key={p.id}>
                      <BulkCheckboxCell id={p.id} selected={selected} onToggle={toggleSelect} disabled={bulkUpdating} />
                      <td className="font-medium">{p.partner?.business_name || '-'}</td>
                      <td className="font-bold text-primary-600">{formatMoney(p.amount)}</td>
                      <td>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                          p.payment_method === 'card'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {p.payment_method === 'card' ? '카드' : '계좌이체'}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500 max-w-xs truncate">{p.memo || '-'}</td>
                      <td><StatusBadge label={statusLabels[p.status]} variant={(statusColors[p.status]?.replace('badge-', '') || 'gray') as 'yellow' | 'green' | 'gray'} /></td>
                      <td className="text-gray-500 text-sm">{new Date(p.created_at).toLocaleDateString('ko-KR')}</td>
                      <td>
                        {p.status === 'requested' && (
                          <div className="flex gap-1">
                            <Button onClick={() => handleComplete(p.id)} variant="primary" size="sm"><Check className="h-3 w-3" /></Button>
                            <Button onClick={() => handleDelete(p.id)} variant="secondary" size="sm" className="text-red-600"><X className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* 생성 모달 */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 modal-bottom-sheet">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">결제 요청 생성</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">업체 선택 *</label>
                <select className="input" value={newPayment.partnerId} onChange={(e) => setNewPayment({...newPayment, partnerId: e.target.value})}>
                  <option value="">선택하세요</option>
                  {partners.map(p => <option key={p.id} value={p.id}>{p.business_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">금액 *</label>
                <input type="number" className="input" placeholder="금액 입력" value={newPayment.amount} onChange={(e) => setNewPayment({...newPayment, amount: e.target.value})} />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">결제 방법 *</label>
                <div className="flex gap-3">
                  {([
                    { value: 'transfer', label: '계좌이체', desc: '무통장 / 가상계좌' },
                    { value: 'card', label: '카드', desc: '신용/체크카드' },
                  ] as const).map(({ value, label, desc }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setNewPayment({ ...newPayment, paymentMethod: value })}
                      className={`flex-1 rounded-xl border-2 px-4 py-3 text-left transition-colors ${
                        newPayment.paymentMethod === value
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <p className={`text-sm font-semibold ${newPayment.paymentMethod === value ? 'text-primary-700' : 'text-gray-700'}`}>{label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">메모</label>
                <textarea className="input min-h-[80px]" placeholder="결제 사유..." value={newPayment.memo} onChange={(e) => setNewPayment({...newPayment, memo: e.target.value})} />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <Button onClick={() => setShowModal(false)} variant="secondary" className="flex-1">취소</Button>
              <Button onClick={handleCreate} disabled={submitting} variant="primary" className="flex-1">{submitting ? '생성 중...' : '생성'}</Button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
