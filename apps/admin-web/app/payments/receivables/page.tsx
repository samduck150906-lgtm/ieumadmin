'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, RefreshCw, CheckCircle2, AlertCircle, Clock } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Button } from '@/components/ui/Button';
import { Card, CardBody } from '@/components/ui/Card';
import { useAuth } from '@/lib/auth';
import { SERVICE_CATEGORY_LABELS } from '@/types/database';
import BulkActionBar, { BulkHeaderCheckbox, BulkCheckboxCell } from '@/components/BulkActionBar';
import { PaymentsTabs } from '../PaymentsTabs';

interface ReceivableRow {
  id: string;
  amount: number;
  service_request_id: string;
  assignment_id?: string;
  receivable_month: string;
  partner_id: string;
  is_paid: boolean;
  paid_at?: string | null;
  payment_request_id?: string | null;
  partner?: { id: string; business_name?: string } | null;
  customer_name?: string;
  category?: string;
}

const formatMoney = (n: number) => `₩${new Intl.NumberFormat('ko-KR').format(n)}`;

export default function ReceivablesPage() {
  const router = useRouter();
  const { session } = useAuth();
  const [list, setList] = useState<ReceivableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'transfer' | 'card'>('transfer');

  const searchParams = useSearchParams();
  const filterFromUrl = searchParams?.get('filter') ?? '';
  const partnerIdFromUrl = searchParams?.get('partnerId') ?? '';
  const [filter, setFilter] = useState<string>(filterFromUrl);

  useEffect(() => {
    if (filterFromUrl && filter !== filterFromUrl) setFilter(filterFromUrl);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterFromUrl]);

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const url = new URL('/api/admin/receivables', window.location.origin);
      if (partnerIdFromUrl) url.searchParams.set('partnerId', partnerIdFromUrl);
      url.searchParams.set('withConsultation', '1');
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setList([]);
        setMessage({ type: 'err', text: (data as { error?: string }).error || '데이터를 불러오지 못했습니다.' });
        return;
      }
      setList(Array.isArray(data.data) ? data.data : []);
      setSelected(new Set());
      setMessage(null);
    } catch {
      setList([]);
      setMessage({ type: 'err', text: '데이터를 불러오지 못했습니다. 다시 시도해 주세요.' });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, partnerIdFromUrl]);

  useEffect(() => { loadData(); }, [loadData]);

  // 날짜 범위 계산
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonthNum = now.getMonth();
  const thisMonthStart = `${thisYear}-${String(thisMonthNum + 1).padStart(2, '0')}-01`;
  const lastMonthStart = new Date(thisYear, thisMonthNum - 1, 1);
  const lastMonthStartStr = lastMonthStart.toISOString().slice(0, 7);

  const filteredList = useMemo(() => {
    if (!filter) return list;
    return list.filter((r) => {
      const monthStr = (r.receivable_month && String(r.receivable_month).slice(0, 7)) || '';
      if (filter === 'lastMonth') return monthStr === lastMonthStartStr;
      if (filter === 'thisMonth') return monthStr === thisMonthStart.slice(0, 7);
      if (filter === 'excludeThisMonth') return monthStr < thisMonthStart.slice(0, 7);
      return true;
    });
  }, [list, filter, lastMonthStartStr, thisMonthStart]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const unpaidIds = filteredList.filter((r) => !r.is_paid).map((r) => r.id);

  const selectAllBeforeLastMonth = () =>
    setSelected(new Set(list.filter((r) =>
      !r.is_paid && String(r.receivable_month).slice(0, 7) < lastMonthStartStr
    ).map((r) => r.id)));

  const selectLastMonthOnly = () =>
    setSelected(new Set(list.filter((r) =>
      !r.is_paid && String(r.receivable_month).slice(0, 7) === lastMonthStartStr
    ).map((r) => r.id)));

  const selectAllExcludeThisMonth = () =>
    setSelected(new Set(list.filter((r) =>
      !r.is_paid && String(r.receivable_month).slice(0, 7) < thisMonthStart.slice(0, 7)
    ).map((r) => r.id)));

  const selectedTotal = list
    .filter((r) => selected.has(r.id))
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const totalAmount = list.reduce((s, r) => s + Number(r.amount || 0), 0);

  const handleCreatePaymentRequest = async () => {
    if (!session?.access_token) {
      setMessage({ type: 'err', text: '로그인이 필요합니다.' });
      return;
    }
    if (selected.size === 0) {
      setMessage({ type: 'err', text: '청구할 미수를 선택하세요.' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/admin/create-payment-from-receivables', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ receivableIds: Array.from(selected), paymentMethod }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || '결제요청 생성 실패' });
        return;
      }
      setMessage({
        type: 'ok',
        text: `결제 요청 ${data.created ?? 0}건이 생성되었습니다.`,
      });
      loadData();
      setTimeout(() => router.push('/payments'), 2000);
    } catch {
      setMessage({ type: 'err', text: '요청 중 오류가 발생했습니다.' });
    } finally {
      setSubmitting(false);
    }
  };

  // 통계
  const paidCount = list.filter((r) => r.is_paid).length;
  const unpaidAmount = list.filter((r) => !r.is_paid).reduce((s, r) => s + Number(r.amount || 0), 0);
  const requestedCount = list.filter((r) => !r.is_paid && r.payment_request_id).length;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <PaymentsTabs activeTab="receivables" />
        <div className="flex items-center gap-4">
          <Link href="/payments" className="p-1 rounded hover:bg-gray-100" aria-label="결제 요청으로 돌아가기">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">미수금액 체크 및 결제</h1>
            <p className="text-sm text-gray-500">업체별 미수금 조회 · 선택 후 결제 요청(청구) 생성</p>
          </div>
        </div>

        {/* 상태 요약 카드 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-amber-200 p-4 flex items-center gap-3">
            <div className="p-2 bg-amber-50 rounded-lg"><AlertCircle className="w-5 h-5 text-amber-600" /></div>
            <div>
              <p className="text-xs text-gray-500">미결제 미수 총액</p>
              <p className="text-lg font-bold text-amber-700">{formatMoney(unpaidAmount)}</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-blue-200 p-4 flex items-center gap-3">
            <div className="p-2 bg-blue-50 rounded-lg"><Clock className="w-5 h-5 text-blue-600" /></div>
            <div>
              <p className="text-xs text-gray-500">결제요청 진행중</p>
              <p className="text-lg font-bold text-blue-700">{requestedCount}건</p>
            </div>
          </div>
          <div className="bg-white rounded-xl border border-green-200 p-4 flex items-center gap-3">
            <div className="p-2 bg-green-50 rounded-lg"><CheckCircle2 className="w-5 h-5 text-green-600" /></div>
            <div>
              <p className="text-xs text-gray-500">이번 달 수납 완료</p>
              <p className="text-lg font-bold text-green-700">{paidCount}건</p>
            </div>
          </div>
        </div>

        {partnerIdFromUrl && (
          <div className="rounded-lg bg-primary-50 border border-primary-200 p-3 text-sm text-primary-800 flex items-center justify-between gap-3">
            <span>
              <strong>해당 업체</strong> 미수만 표시 중입니다.
              {list.length > 0 && list[0]?.partner && typeof list[0].partner === 'object' && (list[0].partner as { business_name?: string }).business_name && (
                <span className="ml-1">({(list[0].partner as { business_name?: string }).business_name})</span>
              )}
            </span>
            <Link href="/payments/receivables" className="text-primary-600 hover:underline font-medium shrink-0">전체 보기</Link>
          </div>
        )}

        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-800">
          <p className="font-medium mb-0.5">안내</p>
          <p>제휴업체 배정이 <strong>전체완료</strong> 상태로 변경되면 자동으로 미수가 생성됩니다. 당월 미수는 다음 달 청구가 원칙입니다.</p>
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm text-slate-700 flex items-center justify-between gap-3 flex-wrap">
          <p>
            <strong>출금 신청 목록</strong> · 공인중개사/제휴업체의 출금 신청은{' '}
            <Link href="/settlements" className="text-primary-600 hover:underline font-medium">정산 관리</Link>
            에서 <strong>승인</strong> 및 <strong>일괄처리</strong>할 수 있습니다.
          </p>
          <Link href="/settlements" className="shrink-0 text-primary-600 hover:underline font-medium text-sm">출금 승인 →</Link>
        </div>

        {message && (
          <div className={`p-3 rounded-lg text-sm ${message.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'}`}>
            {message.text}
          </div>
        )}

        <Card>
          <CardBody className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">전체 미수 총액</p>
                <p className="text-2xl font-bold text-amber-700">{formatMoney(totalAmount)}</p>
                <p className="text-sm text-gray-500">{filteredList.length}건 표시</p>
              </div>
              <Button variant="secondary" size="sm" onClick={loadData} disabled={loading}>
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>

            {/* 기간 필터 */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-gray-500 self-center">기간:</span>
              {[
                { value: '', label: '전체' },
                { value: 'excludeThisMonth', label: '당월 제외' },
                { value: 'lastMonth', label: '전월(M-1)' },
                { value: 'thisMonth', label: '당월' },
              ].map(({ value, label }) => (
                <button
                  key={value || 'all'}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === value ? 'bg-amber-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* 결제 방법 선택 */}
            <div className="flex flex-wrap items-center gap-3 border-t pt-3">
              <span className="text-xs font-medium text-gray-600 self-center">결제 방법:</span>
              {([
                { value: 'transfer', label: '계좌이체', desc: '무통장 / 가상계좌' },
                { value: 'card', label: '카드', desc: '신용/체크카드' },
              ] as const).map(({ value, label, desc }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPaymentMethod(value)}
                  className={`rounded-xl border-2 px-4 py-2 text-left transition-colors ${
                    paymentMethod === value
                      ? 'border-amber-500 bg-amber-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <span className={`text-sm font-semibold ${paymentMethod === value ? 'text-amber-700' : 'text-gray-700'}`}>{label}</span>
                  <span className="ml-1.5 text-xs text-gray-400">{desc}</span>
                </button>
              ))}
            </div>

            {/* 공통 일괄 선택 바 */}
            <div className="space-y-2">
              <BulkActionBar
                totalCount={unpaidIds.length}
                selected={selected}
                allIds={unpaidIds}
                onSelectionChange={setSelected}
                loading={submitting}
                selectAllLabel={`미결제 전체 (${unpaidIds.length}건)`}
                actions={[
                  { label: '결제 요청 생성', value: 'create_payment', variant: 'success' },
                ]}
                onAction={(value) => {
                  if (value === 'create_payment') handleCreatePaymentRequest();
                }}
                extra={
                  <span className="text-sm font-semibold text-amber-700">
                    합계: {formatMoney(selectedTotal)}
                  </span>
                }
              />
              <div className="flex flex-wrap gap-2">
                <span className="text-xs text-gray-500 self-center">빠른 선택:</span>
                <button type="button" onClick={selectAllBeforeLastMonth}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                  전월 이전(M-1)
                </button>
                <button type="button" onClick={selectLastMonthOnly}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                  전월만
                </button>
                <button type="button" onClick={selectAllExcludeThisMonth}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200">
                  당월 제외 전체
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          {loading ? (
            <div className="flex justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-primary-600" />
            </div>
          ) : filteredList.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              {list.length === 0 ? '미수가 없습니다.' : '해당 조건의 미수가 없습니다.'}
            </div>
          ) : (
            <>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <BulkHeaderCheckbox
                        allIds={unpaidIds}
                        selected={selected}
                        onSelectionChange={setSelected}
                      />
                      <th>고객명</th>
                      <th>상담 유형</th>
                      <th>업체명</th>
                      <th>발생월</th>
                      <th className="text-right">금액</th>
                      <th>결제 상태</th>
                      <th>상담</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredList.map((r) => {
                      const businessName = r.partner && typeof r.partner === 'object'
                        ? String((r.partner as { business_name?: string }).business_name ?? '-')
                        : '-';
                      return (
                        <tr key={r.id}>
                          <BulkCheckboxCell
                            id={r.id}
                            selected={selected}
                            onToggle={toggle}
                            disabled={r.is_paid}
                          />
                          <td className="text-gray-800">{r.customer_name ?? '-'}</td>
                          <td className="text-gray-600">{SERVICE_CATEGORY_LABELS[r.category ?? ''] ?? r.category ?? '-'}</td>
                          <td className="font-medium">{businessName}</td>
                          <td className="text-gray-600">{r.receivable_month ? String(r.receivable_month).slice(0, 7) : '-'}</td>
                          <td className="text-right font-semibold">{formatMoney(Number(r.amount || 0))}</td>
                          <td>
                            {r.is_paid ? (
                              <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                                <CheckCircle2 className="w-3 h-3" /> 수납완료
                              </span>
                            ) : r.payment_request_id ? (
                              <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                                <Clock className="w-3 h-3" /> 청구중
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                                <AlertCircle className="w-3 h-3" /> 미청구
                              </span>
                            )}
                          </td>
                          <td>
                            {r.service_request_id && (
                              <Link
                                href={`/requests?sr=${r.service_request_id}`}
                                className="text-sm text-primary-600 hover:underline"
                              >
                                보기
                              </Link>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

            </>
          )}
        </Card>
      </div>
    </AdminLayout>
  );
}
