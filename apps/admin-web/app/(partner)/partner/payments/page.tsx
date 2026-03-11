'use client';

import { useEffect, useState } from 'react';
import { RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PaymentRow {
  id: string;
  created_at: string;
  payment_type: string;
  amount: number;
  status: string;
  memo?: string | null;
}

function PaymentCard({ p }: { p: PaymentRow }) {
  const [expanded, setExpanded] = useState(false);
  const typeLabel = p.payment_type === 'view'
    ? 'DB 열람'
    : p.payment_type === 'completion'
      ? '예약완료'
      : p.payment_type === 'admin_request'
        ? '관리자 요청'
        : p.payment_type;
  const statusLabel = p.status === 'completed' ? '완료' : p.status === 'pending' || p.status === 'requested' ? '대기' : p.status;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-800">
            {p.created_at ? new Date(p.created_at).toLocaleDateString('ko-KR') : '-'}
          </p>
          <p className="text-sm text-gray-500 mt-0.5">{typeLabel}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-gray-900">₩{Number(p.amount).toLocaleString()}</p>
          <span
            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs ${
              p.status === 'completed'
                ? 'bg-green-50 text-green-700'
                : p.status === 'pending' || p.status === 'requested'
                  ? 'bg-yellow-50 text-yellow-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {statusLabel}
          </span>
        </div>
      </div>
      {(p.memo || typeLabel) && (
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
        >
          {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {expanded ? '접기' : '상세 보기'}
        </button>
      )}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1 text-sm text-gray-600">
          {p.memo && <p><span className="text-gray-400">메모:</span> {p.memo}</p>}
        </div>
      )}
    </div>
  );
}

export default function PartnerPayments() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadPayments();
  }, []);

  async function loadPayments() {
    if (!supabase) {
      setLoading(false);
      setError('연결을 초기화할 수 없습니다.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('로그인이 필요합니다.');
        setLoading(false);
        return;
      }
      const { data: partner } = await supabase
        .from('partners')
        .select('id')
        .eq('user_id', user.id)
        .single();
      if (!partner) {
        setError('제휴업체 정보를 찾을 수 없습니다.');
        setLoading(false);
        return;
      }

      const rows: PaymentRow[] = [];

      const { data: viewPayments } = await supabase
        .from('db_view_payments')
        .select('id, paid_at, amount')
        .eq('partner_id', partner.id)
        .order('paid_at', { ascending: false });

      for (const p of viewPayments || []) {
        rows.push({
          id: p.id,
          created_at: p.paid_at,
          payment_type: 'view',
          amount: Number(p.amount),
          status: 'completed',
          memo: 'DB 열람',
        });
      }

      const { data: requests } = await supabase
        .from('partner_payment_requests')
        .select('id, created_at, amount, status, memo')
        .eq('partner_id', partner.id)
        .order('created_at', { ascending: false });

      for (const p of requests || []) {
        rows.push({
          id: p.id,
          created_at: p.created_at,
          payment_type: 'admin_request',
          amount: Number(p.amount),
          status: p.status === 'completed' ? 'completed' : p.status === 'requested' ? 'pending' : p.status,
          memo: p.memo || null,
        });
      }

      rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setPayments(rows);
    } catch {
      setError('데이터 처리 중 문제가 발생했습니다.');
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">결제 내역</h1>
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={loadPayments}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200"
          >
            <RefreshCw className="w-4 h-4" />
            재시도
          </button>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        {/* 데스크톱: 테이블 */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 font-medium">일시</th>
                <th className="text-left p-4 font-medium">유형</th>
                <th className="text-right p-4 font-medium">금액</th>
                <th className="text-left p-4 font-medium">상태</th>
                <th className="text-left p-4 font-medium">메모</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="p-4">
                    {p.created_at ? new Date(p.created_at).toLocaleDateString('ko-KR') : '-'}
                  </td>
                  <td className="p-4">
                    {p.payment_type === 'view'
                      ? 'DB 열람'
                      : p.payment_type === 'completion'
                        ? '예약완료'
                        : p.payment_type === 'admin_request'
                          ? '관리자 요청'
                          : p.payment_type}
                  </td>
                  <td className="p-4 text-right font-medium">₩{Number(p.amount).toLocaleString()}</td>
                  <td className="p-4">
                    <span
                      className={`px-2 py-1 rounded-full text-xs ${
                        p.status === 'completed'
                          ? 'bg-green-50 text-green-700'
                          : p.status === 'pending' || p.status === 'requested'
                            ? 'bg-yellow-50 text-yellow-700'
                            : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {p.status === 'completed' ? '완료' : p.status === 'pending' || p.status === 'requested' ? '대기' : p.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-500">{p.memo || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 모바일: 카드 */}
        <div className="md:hidden p-4 space-y-3">
          {payments.map((p) => (
            <PaymentCard key={p.id} p={p} />
          ))}
        </div>

        {!loading && payments.length === 0 && !error && (
          <p className="text-center py-8 text-gray-400">결제 내역이 없습니다</p>
        )}
      </div>
    </div>
  );
}
