'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import { Wallet, ChevronLeft, Star, CheckCircle, AlertCircle, RefreshCw, Info } from 'lucide-react';

interface ReceivableItem {
  id: string;
  amount: number;
  service_request_id: string;
}

interface MileageHistory {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  balance_after: number;
  created_at: string;
}

const MILEAGE_TYPE_LABELS: Record<string, string> = {
  earned_3pct: '적립 (3%)',
  earned_5pct: '적립 (5%)',
  used_db_purchase: 'DB 구매 차감',
  used_payment: '결제 차감',
  manual_add: '수동 적립',
  manual_deduct: '수동 차감',
};

export default function PartnerUnpaidPayPage() {
  const [list, setList] = useState<ReceivableItem[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // 마일리지
  const [mileageBalance, setMileageBalance] = useState(0);
  const [mileageTotalEarned, setMileageTotalEarned] = useState(0);
  const [mileageHistory, setMileageHistory] = useState<MileageHistory[]>([]);
  const [showMileage, setShowMileage] = useState(false);
  const [useMileage, setUseMileage] = useState(true);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const [statsRes, mileageRes] = await Promise.all([
        fetch('/api/partner/dashboard-stats', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
        fetch('/api/partner/mileage', { headers: token ? { Authorization: `Bearer ${token}` } : {} }),
      ]);

      if (statsRes.ok) {
        const json = await statsRes.json();
        setList(json.receivableList || []);
        setTotal(json.receivableTotal ?? 0);
        setSelected(new Set());
        setMessage(null);
      } else {
        setList([]);
        setTotal(0);
        setMessage({ type: 'err', text: '미수금 목록을 불러오지 못했습니다.' });
      }

      if (mileageRes.ok) {
        const mj = await mileageRes.json();
        setMileageBalance(mj.balance ?? 0);
        setMileageTotalEarned(mj.totalEarned ?? 0);
        setMileageHistory(mj.history || []);
      }
    } catch {
      setList([]);
      setTotal(0);
      setMessage({ type: 'err', text: '미수금 목록을 불러오지 못했습니다. 새로고침해 주세요.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => { if (list.length > 0) setSelected(new Set(list.map((r) => r.id))); };

  const selectedTotal = list.filter((r) => selected.has(r.id)).reduce((sum, r) => sum + r.amount, 0);
  const mileageApplied = useMileage ? Math.min(mileageBalance, selectedTotal) : 0;
  const payAmount = selectedTotal - mileageApplied;

  const handleSubmit = async () => {
    if (selected.size === 0) { setMessage({ type: 'err', text: '결제 요청할 미수를 선택하세요.' }); return; }
    if (!supabase) { setMessage({ type: 'err', text: '연결을 확인해 주세요.' }); return; }
    setSubmitting(true);
    setMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/partner/create-payment-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({
          receivableIds: Array.from(selected),
          useMileage: useMileage && mileageBalance > 0,
          mileageAmount: mileageApplied,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ type: 'err', text: data.error || '결제 요청 실패' });
        return;
      }
      const applied = Number(data.mileage_applied ?? mileageApplied);
      setMessage({
        type: 'ok',
        text: applied > 0
          ? `결제 요청 완료! 마일리지 ₩${applied.toLocaleString()} 차감, 실결제 ₩${Number(data.amount ?? payAmount).toLocaleString()}`
          : `결제 요청이 접수되었습니다. (₩${Number(data.amount || 0).toLocaleString()})`,
      });
      loadData();
    } catch {
      setMessage({ type: 'err', text: '요청 중 오류가 발생했습니다.' });
    } finally {
      setSubmitting(false);
    }
  };

  const fmt = (n: number) => `₩${n.toLocaleString()}`;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/partner/dashboard" className="p-1 -ml-1 rounded-xl hover:bg-gray-100">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">미수금 결제</h1>
          <p className="text-sm text-gray-500">마일리지를 우선 차감 후 잔액을 카드/이체로 결제합니다</p>
        </div>
        <Link
          href="/partner/payments"
          className="shrink-0 px-4 py-2 text-sm font-medium text-brand-primary hover:bg-blue-50 rounded-xl border border-brand-primary/30 transition"
        >
          결제 내역
        </Link>
      </div>

      {/* 마일리지 카드 */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-500 fill-amber-400" />
            <h2 className="font-semibold text-amber-800">마일리지 잔액</h2>
          </div>
          <button
            type="button"
            onClick={() => setShowMileage(!showMileage)}
            className="text-xs text-amber-700 hover:underline"
          >
            {showMileage ? '이력 접기' : '이력 보기'}
          </button>
        </div>
        <p className="text-3xl font-bold text-amber-700 mb-1">{fmt(mileageBalance)}</p>
        <p className="text-xs text-amber-600">누적 적립 {fmt(mileageTotalEarned)}</p>

        {mileageBalance > 0 && (
          <label className="flex items-center gap-2 mt-3 cursor-pointer">
            <input
              type="checkbox"
              checked={useMileage}
              onChange={(e) => setUseMileage(e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 border-amber-400"
            />
            <span className="text-sm text-amber-800 font-medium">마일리지 우선 차감 적용</span>
          </label>
        )}

        <div className="mt-2 text-xs text-amber-600 flex items-start gap-1">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>결제금액 200만원 이상 3%, 500만원 이상 5% 마일리지 적립</span>
        </div>

        {/* 마일리지 이력 */}
        {showMileage && (
          <div className="mt-3 pt-3 border-t border-amber-200 space-y-1.5 max-h-40 overflow-y-auto">
            {mileageHistory.length === 0 ? (
              <p className="text-xs text-amber-600">이력이 없습니다</p>
            ) : (
              mileageHistory.map((h) => (
                <div key={h.id} className="flex items-center justify-between text-xs">
                  <span className="text-amber-700">{MILEAGE_TYPE_LABELS[h.type] || h.type}</span>
                  <div className="flex items-center gap-2">
                    <span className={h.amount > 0 ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'}>
                      {h.amount > 0 ? '+' : ''}{fmt(h.amount)}
                    </span>
                    <span className="text-amber-500">잔액 {fmt(h.balance_after)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* 알림 메시지 */}
      {message && (
        <div className={`p-4 rounded-xl flex items-start gap-2 ${
          message.type === 'ok' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
        }`}>
          {message.type === 'ok'
            ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
            : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span className="text-sm">{message.text}</span>
        </div>
      )}

      {/* 미수금 리스트 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-amber-500" />
            <span className="font-semibold">미수금 목록</span>
          </div>
          <span className="text-lg font-bold text-amber-700">{fmt(total)}</span>
        </div>

        {list.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-10 h-10 text-green-400 mx-auto mb-2" />
            <p className="text-gray-500 font-medium">미수금이 없습니다!</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b flex justify-end">
              <button
                type="button"
                onClick={selectAll}
                className="text-sm text-brand-primary hover:underline font-medium"
              >
                전체 선택
              </button>
            </div>
            <ul className="divide-y">
              {list.map((r) => (
                <li key={r.id} className="flex items-center gap-3 p-4 hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="w-4 h-4 rounded border-gray-300 text-brand-primary"
                  />
                  <div className="flex-1">
                    <span className="text-gray-600 text-sm">미수금</span>
                    <Link
                      href={`/partner/assignments?sr=${r.service_request_id}`}
                      className="ml-2 text-xs text-brand-primary hover:underline"
                    >
                      상세 보기
                    </Link>
                  </div>
                  <span className="font-semibold text-amber-700">{fmt(r.amount)}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {/* 결제 요약 + 버튼 */}
      {list.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card p-5 space-y-3">
          <h3 className="font-semibold">결제 요약</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>선택 미수금</span>
              <span className="font-medium">{fmt(selectedTotal)} ({selected.size}건)</span>
            </div>
            {useMileage && mileageApplied > 0 && (
              <div className="flex justify-between text-amber-700">
                <span className="flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-amber-400" /> 마일리지 차감
                </span>
                <span className="font-medium">- {fmt(mileageApplied)}</span>
              </div>
            )}
            <div className="flex justify-between text-gray-800 font-bold pt-2 border-t">
              <span>실결제 금액</span>
              <span className="text-lg text-brand-primary">{fmt(payAmount)}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || selected.size === 0}
            className="w-full py-3.5 bg-brand-primary text-white font-semibold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
          >
            {submitting ? '처리 중...' : `결제 요청하기${payAmount > 0 ? ` (${fmt(payAmount)})` : ' (마일리지 전액 차감)'}`}
          </button>

          <p className="text-xs text-gray-400 text-center">
            결제 요청 접수 후 본사에서 카드/이체로 정산해 드립니다
          </p>
        </div>
      )}

    </div>
  );
}
