'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import {
  Wallet,
  CheckCircle,
  Clock,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  TrendingUp,
  Gift,
  Receipt,
  Calendar,
} from 'lucide-react';

type Tab = 'scheduled' | 'completed' | 'history';

interface ReceivableItem {
  id: string;
  amount: number;
  receivable_month: string;
  is_paid: boolean;
  service_request_id: string;
  category?: string;
}

interface PaymentItem {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  memo: string | null;
}

interface AssignmentItem {
  id: string;
  status: string;
  reserved_price: number | null;
  installation_date: string | null;
  created_at: string;
  category?: string;
}

function fmt(n: number) {
  return `₩${n.toLocaleString()}`;
}

const CATEGORY_LABELS: Record<string, string> = {
  moving: '이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  kiosk: '키오스크',
};

export default function PartnerSettlements() {
  const [tab, setTab] = useState<Tab>('scheduled');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 요약
  const [unpaidTotal, setUnpaidTotal] = useState(0);
  const [paidTotal, setPaidTotal] = useState(0);
  const [pendingRequestTotal, setPendingRequestTotal] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  // 탭별 데이터
  const [receivables, setReceivables] = useState<ReceivableItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [reservedAssignments, setReservedAssignments] = useState<AssignmentItem[]>([]);
  const [realtorCommissions, setRealtorCommissions] = useState<{ id: string; amount: number; created_at: string; commission_type: string }[]>([]);

  const [role, setRole] = useState<'partner' | 'realtor' | null>(null);
  const isRealtor = role === 'realtor';

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('로그인이 필요합니다.'); setLoading(false); return; }

      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .single();

      const userRole = userData?.role as 'partner' | 'realtor' | undefined;
      if (userRole === 'realtor') {
        setRole('realtor');
        const { data: realtor } = await supabase
          .from('realtors')
          .select('id')
          .eq('user_id', user.id)
          .single();
        if (!realtor) { setError('공인중개사 정보를 찾을 수 없습니다.'); setLoading(false); return; }

        const [commissionsRes, withdrawalsRes] = await Promise.all([
          supabase
            .from('commissions')
            .select('id, amount, is_settled, settled_at, created_at, commission_type')
            .eq('realtor_id', realtor.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('withdrawal_requests')
            .select('id, amount, status, created_at, completed_at')
            .eq('realtor_id', realtor.id)
            .order('created_at', { ascending: false }),
        ]);

        const comms = commissionsRes.data || [];
        const wds = withdrawalsRes.data || [];
        const unpaidComms = comms.filter((c: { is_settled: boolean }) => !c.is_settled);
        const unpaidTotalRealtor = unpaidComms.reduce((s: number, c: { amount?: number }) => s + Number(c.amount ?? 0), 0);
        const completedTotal = wds
          .filter((w: { status: string }) => w.status === 'completed')
          .reduce((s: number, w: { amount?: number }) => s + Number(w.amount ?? 0), 0);
        const pendingTotal = wds
          .filter((w: { status: string }) => w.status === 'pending' || w.status === 'approved')
          .reduce((s: number, w: { amount?: number }) => s + Number(w.amount ?? 0), 0);

        setUnpaidTotal(unpaidTotalRealtor);
        setPaidTotal(completedTotal);
        setPendingRequestTotal(pendingTotal);
        setCompletedCount(wds.filter((w: { status: string }) => w.status === 'completed').length);
        setReceivables([]);
        setPayments(
          wds.map((w: { id: string; amount: number; status: string; created_at: string; completed_at: string | null }) => ({
            id: w.id,
            amount: w.amount,
            status: w.status,
            created_at: w.created_at,
            completed_at: w.completed_at,
            memo: null,
          }))
        );
        setReservedAssignments([]);
        setRealtorCommissions(
          unpaidComms.map((c: { id: string; amount: number; created_at: string; commission_type: string }) => ({
            id: c.id,
            amount: c.amount,
            created_at: c.created_at,
            commission_type: c.commission_type || 'revenue_share',
          }))
        );
        setLoading(false);
        return;
      }

      setRole('partner');
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!partner) { setError('업체 정보를 찾을 수 없습니다.'); setLoading(false); return; }

      const [receivablesRes, paymentRequestsRes, assignmentsRes] = await Promise.all([
        // 미수금 (청구됐지만 미납된 금액)
        supabase
          .from('partner_receivables')
          .select('id, amount, receivable_month, is_paid, service_request_id')
          .eq('partner_id', partner.id)
          .order('receivable_month', { ascending: false }),

        // 결제 요청 내역 (청구서)
        supabase
          .from('partner_payment_requests')
          .select('id, amount, status, created_at, completed_at, memo')
          .eq('partner_id', partner.id)
          .order('created_at', { ascending: false }),

        // 예약완료(예정 청구) 배정
        supabase
          .from('partner_assignments')
          .select(`
            id, status, reserved_price, installation_date, created_at,
            service_request:service_requests(category)
          `)
          .eq('partner_id', partner.id)
          .eq('status', 'reserved')
          .order('installation_date', { ascending: true }),
      ]);

      const rcv = receivablesRes.data || [];
      const pay = paymentRequestsRes.data || [];
      const asgn = assignmentsRes.data || [];

      // 요약 계산
      const unpaid = rcv.filter((r) => !r.is_paid).reduce((s, r) => s + Number(r.amount || 0), 0);
      const paid = pay.filter((p) => p.status === 'completed').reduce((s, p) => s + Number(p.amount || 0), 0);
      const pending = pay.filter((p) => p.status === 'requested').reduce((s, p) => s + Number(p.amount || 0), 0);

      // 완료 건수
      const { count } = await supabase
        .from('partner_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partner.id)
        .eq('status', 'completed');

      setUnpaidTotal(unpaid);
      setPaidTotal(paid);
      setPendingRequestTotal(pending);
      setCompletedCount(count || 0);

      setReceivables(rcv.filter((r) => !r.is_paid));
      setPayments(pay);
      setReservedAssignments(
        asgn.map((a: Record<string, unknown>) => {
          const sr = Array.isArray(a.service_request) ? (a.service_request as Record<string, unknown>[])[0] : a.service_request as Record<string, unknown> | undefined;
          return {
            id: String(a.id ?? ''),
            status: String(a.status ?? ''),
            reserved_price: a.reserved_price != null ? Number(a.reserved_price) : null,
            installation_date: a.installation_date != null ? String(a.installation_date) : null,
            created_at: String(a.created_at ?? ''),
            category: sr ? String((sr as Record<string, unknown>).category ?? '') : undefined,
          };
        })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터 로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const tabConfig: { key: Tab; label: string; icon: React.ElementType }[] = isRealtor
    ? [
        { key: 'scheduled', label: '미정산 수익금', icon: TrendingUp },
        { key: 'completed', label: '출금 내역', icon: Receipt },
        { key: 'history', label: '전체 내역', icon: Receipt },
      ]
    : [
        { key: 'scheduled', label: '예정 청구', icon: Clock },
        { key: 'completed', label: '결제 내역', icon: Receipt },
        { key: 'history', label: '미수금', icon: AlertCircle },
      ];

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{isRealtor ? '내 수익 현황' : '정산 현황'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {isRealtor ? '수익금·출금 현황' : '청구·결제·미수금 현황'}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="p-2 rounded-xl bg-white border hover:bg-gray-50 transition-colors"
          title="새로고침"
        >
          <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm">{error}</div>
      )}

      {/* 요약 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isRealtor ? (
          <>
            <div className="bg-white rounded-2xl shadow-card p-4 col-span-2 border border-amber-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <TrendingUp className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-amber-700 font-medium">출금 가능 수익금</span>
                  </div>
                  <p className="text-3xl font-bold text-amber-700">{fmt(unpaidTotal)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs text-gray-500">출금 완료</span>
              </div>
              <p className="text-xl font-bold text-green-600">{fmt(paidTotal)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500">출금 대기 중</span>
              </div>
              <p className="text-xl font-bold text-blue-600">{fmt(pendingRequestTotal)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-gray-500">출금 완료 건수</span>
              </div>
              <p className="text-xl font-bold text-purple-600">{completedCount}건</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-card p-4 col-span-2 border border-amber-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <AlertCircle className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-amber-700 font-medium">미납 미수금</span>
                  </div>
                  <p className="text-3xl font-bold text-amber-700">{fmt(unpaidTotal)}</p>
                </div>
                <Link
                  href="/partner/unpaid-pay"
                  className="flex items-center gap-1 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors"
                >
                  바로 결제 <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-xs text-gray-500">납부 완료</span>
              </div>
              <p className="text-xl font-bold text-green-600">{fmt(paidTotal)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-gray-500">결제 대기 중</span>
              </div>
              <p className="text-xl font-bold text-blue-600">{fmt(pendingRequestTotal)}</p>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                <span className="text-xs text-gray-500">완료 건수</span>
              </div>
              <p className="text-xl font-bold text-purple-600">{completedCount}건</p>
            </div>
            <div className="bg-white rounded-2xl shadow-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="w-4 h-4 text-indigo-500" />
                <span className="text-xs text-gray-500">예약완료(예정 청구)</span>
              </div>
              <p className="text-xl font-bold text-indigo-600">{reservedAssignments.length}건</p>
            </div>
          </>
        )}
      </div>

      {/* 탭 */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabConfig.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              tab === key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* 예정 청구 / 미정산 수익금 탭 */}
      {tab === 'scheduled' && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">로딩 중...</div>
          ) : isRealtor ? (
            realtorCommissions.length === 0 ? (
              <div className="bg-white rounded-2xl border p-10 text-center">
                <TrendingUp className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">미정산 수익금이 없습니다</p>
                <p className="text-gray-300 text-xs mt-1">고객 초대 후 서비스 완료 시 수익금이 적립됩니다</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-gray-500 px-1">
                  출금 신청 시 정산 처리됩니다.
                </p>
                {realtorCommissions.map((c) => (
                  <div key={c.id} className="bg-white rounded-2xl border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                          미정산
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(c.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      <span className="font-bold text-gray-800">{fmt(c.amount)}</span>
                    </div>
                  </div>
                ))}
              </>
            )
          ) : reservedAssignments.length === 0 ? (
            <div className="bg-white rounded-2xl border p-10 text-center">
              <Calendar className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">예약완료 건이 없습니다</p>
              <p className="text-gray-300 text-xs mt-1">예약완료 시 자동으로 미수금이 생성됩니다</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-gray-500 px-1">
                예약완료 상태의 건은 서비스 완료 후 청구됩니다.
              </p>
              {reservedAssignments.map((a) => (
                <div key={a.id} className="bg-white rounded-2xl border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                        예약완료
                      </span>
                      {a.category && (
                        <span className="text-sm text-gray-600 ml-2">
                          {CATEGORY_LABELS[a.category] ?? a.category}
                        </span>
                      )}
                    </div>
                    {a.reserved_price != null && a.reserved_price > 0 ? (
                      <span className="font-bold text-gray-800">{fmt(a.reserved_price)}</span>
                    ) : (
                      <span className="text-xs text-gray-400">금액 미입력</span>
                    )}
                  </div>
                  {a.installation_date && (
                    <p className="text-xs text-gray-400 mt-2">
                      예약일: {a.installation_date}
                    </p>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 결제/출금 내역 탭 */}
      {tab === 'completed' && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">로딩 중...</div>
          ) : (isRealtor ? payments.filter((p) => p.status === 'completed') : payments).length === 0 ? (
            <div className="bg-white rounded-2xl border p-10 text-center">
              <Receipt className="w-10 h-10 text-gray-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">{isRealtor ? '출금 내역이 없습니다' : '결제 내역이 없습니다'}</p>
            </div>
          ) : (
            (isRealtor ? payments.filter((p) => p.status === 'completed') : payments).map((p) => {
              const statusLabel = isRealtor
                ? { completed: '출금 완료', approved: '승인됨', pending: '대기 중', rejected: '반려' }[p.status] ?? p.status
                : p.status === 'completed' ? '납부 완료' : '결제 대기';
              const isDone = isRealtor ? p.status === 'completed' : p.status === 'completed';
              return (
                <div key={p.id} className="bg-white rounded-2xl border p-4">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          isDone ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {statusLabel}
                      </span>
                      {p.memo && !isRealtor && (
                        <span className="text-xs text-gray-500 truncate max-w-[140px]">{p.memo}</span>
                      )}
                    </div>
                    <span className={`font-bold ${isDone ? 'text-green-700' : 'text-amber-700'}`}>
                      {fmt(Number(p.amount))}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">
                    {isRealtor ? '신청일' : '청구일'}: {new Date(p.created_at).toLocaleDateString('ko-KR')}
                    {p.completed_at && ` · ${isRealtor ? '완료일' : '납부일'}: ${new Date(p.completed_at).toLocaleDateString('ko-KR')}`}
                  </p>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 미수금 / 전체 출금 탭 */}
      {tab === 'history' && (
        <div className="space-y-3">
          {loading ? (
            <div className="text-center py-12 text-gray-400">로딩 중...</div>
          ) : isRealtor ? (
            payments.length === 0 ? (
              <div className="bg-white rounded-2xl border p-10 text-center">
                <Receipt className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                <p className="text-gray-400 text-sm">출금 내역이 없습니다</p>
              </div>
            ) : (
              payments.map((p) => {
                const statusLabel = { completed: '출금 완료', approved: '승인됨', pending: '대기 중', rejected: '반려' }[p.status] ?? p.status;
                return (
                  <div key={p.id} className="bg-white rounded-2xl border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                          {statusLabel}
                        </span>
                        <span className="text-xs text-gray-500 ml-2">
                          {new Date(p.created_at).toLocaleDateString('ko-KR')}
                        </span>
                      </div>
                      <span className="font-bold text-gray-800">{fmt(Number(p.amount))}</span>
                    </div>
                  </div>
                );
              })
            )
          ) : receivables.length === 0 ? (
            <div className="bg-white rounded-2xl border p-10 text-center">
              <CheckCircle className="w-10 h-10 text-green-200 mx-auto mb-3" />
              <p className="text-gray-400 text-sm">미납 미수금이 없습니다</p>
              <p className="text-gray-300 text-xs mt-1">모든 금액이 정산되었습니다</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-1">
                <p className="text-xs text-gray-500">
                  미납 합계: <strong className="text-amber-700">{fmt(unpaidTotal)}</strong>
                </p>
                <Link
                  href="/partner/unpaid-pay"
                  className="text-xs text-brand-primary font-medium flex items-center gap-1 hover:underline"
                >
                  결제하기 <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
              {receivables.map((r) => (
                <div key={r.id} className="bg-white rounded-2xl border border-amber-100 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                        미납
                      </span>
                      <span className="text-xs text-gray-500 ml-2">
                        {r.receivable_month
                          ? `${r.receivable_month.slice(0, 7)} 발생분`
                          : '발생분'}
                      </span>
                    </div>
                    <span className="font-bold text-amber-700">{fmt(Number(r.amount))}</span>
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* 안내 */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl border border-blue-100 p-5">
        <div className="flex items-start gap-3">
          <Gift className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
          <div>
            <h3 className="font-semibold text-blue-800 text-sm">{isRealtor ? '수익금 안내' : '정산 안내'}</h3>
            <ul className="text-sm text-blue-700 mt-1.5 space-y-0.5">
              {isRealtor ? (
                <>
                  <li>• 고객 초대 후 서비스 완료 시 수익금이 적립됩니다</li>
                  <li>• 출금 신청은 프로필에서 계좌 등록 후 가능합니다</li>
                  <li>• 출금 승인 후 영업일 기준으로 입금됩니다</li>
                </>
              ) : (
                <>
                  <li>• 예약완료 시 서비스 완료가액이 미수금으로 생성됩니다</li>
                  <li>• 미수금은 본사에서 결제 요청 후 청구됩니다</li>
                  <li>• 결제 완료 시 마일리지가 자동 적립됩니다 (200만↑ 3%, 500만↑ 5%)</li>
                </>
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
