'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import {
  Star,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  AlertCircle,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';

const TYPE_LABELS: Record<string, { label: string; dir: 'earn' | 'use' }> = {
  earned_3pct: { label: '결제 적립 (3%)', dir: 'earn' },
  earned_5pct: { label: '결제 적립 (5%)', dir: 'earn' },
  used_db_purchase: { label: 'DB 구매 사용', dir: 'use' },
  used_payment: { label: '미수금 결제 사용', dir: 'use' },
  manual_add: { label: '수동 적립', dir: 'earn' },
  manual_deduct: { label: '수동 차감', dir: 'use' },
};

interface MileageHistory {
  id: string;
  amount: number;
  type: string;
  note: string | null;
  balance_after: number;
  created_at: string;
}

interface MileageData {
  balance: number;
  totalEarned: number;
  totalUsed: number;
  history: MileageHistory[];
}

function fmt(n: number) {
  return `₩${n.toLocaleString()}`;
}

export default function MileagePage() {
  const [data, setData] = useState<MileageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/partner/mileage', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `조회 실패 (${res.status})`);
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '로드 실패');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 rounded-2xl text-center">
        <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
        <p className="text-red-700 font-medium mb-3">{error}</p>
        <button
          type="button"
          onClick={load}
          className="px-4 py-2 bg-brand-primary text-white rounded-xl text-sm font-medium"
        >
          다시 시도
        </button>
      </div>
    );
  }

  const d = data!;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">마일리지</h1>
          <p className="text-sm text-gray-500 mt-0.5">정책 · 적립률 · 잔액 · 내역</p>
        </div>
        <button
          type="button"
          onClick={load}
          className="p-2 rounded-xl bg-white border hover:bg-gray-50 transition-colors"
          title="새로고침"
        >
          <RefreshCw className="w-4 h-4 text-gray-500" />
        </button>
      </div>

      {/* 1. 정책: 선적립 / 선차감 */}
      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/80">
          <h2 className="font-semibold text-gray-800">정책</h2>
          <p className="text-xs text-gray-500 mt-0.5">마일리지 선적립·선차감 방식</p>
        </div>
        <div className="p-5">
          <ul className="text-sm text-gray-600 space-y-3">
            <li className="flex items-start gap-2">
              <ArrowUpCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-gray-800">선적립</strong> — 결제 완료 시 결제 금액 기준으로 마일리지가 자동 적립됩니다.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <ArrowDownCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                <strong className="text-gray-800">선차감</strong> — DB 구매·미수금 결제 시 마일리지 잔액을 우선 사용(차감)한 뒤, 부족분만 결제합니다.
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* 2. 적립률 안내: 200만↑ 3%, 500만↑ 5% */}
      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 bg-amber-50/60">
          <h2 className="font-semibold text-amber-800">적립률 안내</h2>
          <p className="text-xs text-amber-700/80 mt-0.5">결제 금액 구간별 적립률</p>
        </div>
        <div className="p-5">
          <ul className="text-sm text-gray-600 space-y-2.5">
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              결제 금액 <strong className="text-gray-800">200만원 이상</strong> → <strong className="text-amber-600">3%</strong> 적립
            </li>
            <li className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-500 shrink-0" />
              결제 금액 <strong className="text-gray-800">500만원 이상</strong> → <strong className="text-amber-600">5%</strong> 적립
            </li>
          </ul>
        </div>
      </section>

      {/* 3. 잔액 */}
      <section className="space-y-2">
        <h2 className="font-semibold text-gray-800 px-0.5">잔액</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 col-span-3 sm:col-span-1">
            <div className="flex items-center gap-2 mb-1">
              <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
              <span className="text-xs text-amber-700 font-medium">현재 잔액</span>
            </div>
            <p className="text-3xl font-bold text-amber-700">{fmt(d.balance)}</p>
            <p className="text-xs text-amber-600 mt-1">DB 구매·미수금 결제 시 자동 차감</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-xs text-gray-500">총 적립</span>
            </div>
            <p className="text-xl font-bold text-green-600">{fmt(d.totalEarned)}</p>
          </div>
          <div className="bg-white border border-gray-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-gray-400" />
              <span className="text-xs text-gray-500">총 사용</span>
            </div>
            <p className="text-xl font-bold text-gray-600">{fmt(d.totalUsed)}</p>
          </div>
        </div>
      </section>

      {/* 4. 내역 */}
      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold">내역</h2>
          <p className="text-xs text-gray-400 mt-0.5">적립·사용 내역 (최근 30건)</p>
        </div>

        {d.history.length === 0 ? (
          <div className="py-16 text-center">
            <Star className="w-10 h-10 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">마일리지 내역이 없습니다.</p>
            <p className="text-gray-300 text-xs mt-1">결제 금액이 200만원 이상이면 자동 적립됩니다.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {d.history.map((row) => {
              const meta = TYPE_LABELS[row.type] ?? { label: row.type, dir: 'earn' as const };
              const isEarn = meta.dir === 'earn';
              return (
                <div key={row.id} className="flex items-start sm:items-center gap-4 px-5 py-3.5">
                  <div className={`shrink-0 rounded-full p-1.5 ${isEarn ? 'bg-green-50' : 'bg-gray-100'}`}>
                    {isEarn
                      ? <ArrowUpCircle className="w-4 h-4 text-green-500" />
                      : <ArrowDownCircle className="w-4 h-4 text-gray-400" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-medium text-gray-800">{meta.label}</p>
                      <p className={`text-sm font-bold ${isEarn ? 'text-green-600' : 'text-gray-500'}`}>
                        {isEarn ? '+' : '-'}{fmt(row.amount)}
                      </p>
                    </div>
                    {row.note && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{row.note}</p>
                    )}
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(row.created_at).toLocaleString('ko-KR', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                      <span className="sm:ml-2 block sm:inline mt-0.5 sm:mt-0">잔액 {fmt(row.balance_after)}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
