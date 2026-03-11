'use client';

import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';
import {
  Wallet,
  ChevronLeft,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ReceivableRow {
  id: string;
  amount: number;
  receivable_month: string;
  service_request_id: string;
  customer_name: string;
  customer_phone: string;
  category: string;
  reservation_date: string | null;
  created_at: string;
}

/** 미수 상태: 예약 완료·미납 건은 모두 '미납' */
const RECEIVABLE_STATUS = '미납';

function ReceivableCard({ r, fmt }: { r: ReceivableRow; fmt: (n: number) => string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-800">{r.customer_name}</p>
          <p className="text-sm text-gray-500 mt-0.5">
            {r.reservation_date
              ? new Date(r.reservation_date).toLocaleDateString('ko-KR')
              : '-'}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="font-bold text-amber-700">{fmt(r.amount)}</p>
          <span className="inline-block mt-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-xs font-medium">
            {RECEIVABLE_STATUS}
          </span>
        </div>
      </div>
      <div className="mt-2">
        <Link
          href={`/partner/assignments?sr=${r.service_request_id}`}
          className="inline-flex items-center gap-0.5 text-xs text-brand-primary hover:underline font-medium"
        >
          DB 상세 <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="mt-3 flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? '접기' : '상세 보기'}
      </button>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5 text-sm text-gray-600">
          {r.customer_phone && <p><span className="text-gray-400">연락처:</span> {r.customer_phone}</p>}
          <p><span className="text-gray-400">서비스:</span> {r.category}</p>
          <p><span className="text-gray-400">발생월:</span>{' '}
            {r.receivable_month
              ? new Date(r.receivable_month).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short' })
              : '-'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function PartnerReceivablesPage() {
  const [list, setList] = useState<ReceivableRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const res = await fetch('/api/partner/receivables', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || '미수금 목록을 불러오지 못했습니다.');
        setList([]);
        setTotal(0);
        return;
      }
      setList(json.list || []);
      setTotal(json.receivableTotal ?? 0);
    } catch {
      setError('미수금 목록을 불러오지 못했습니다.');
      setList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const fmt = (n: number) => `₩${n.toLocaleString()}`;

  if (loading && list.length === 0) {
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
        <div>
          <h1 className="text-2xl font-bold">미수금 관리</h1>
          <p className="text-sm text-gray-500">
            예약 완료되었으나 아직 결제되지 않은 상담 건을 확인할 수 있습니다
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center justify-between gap-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-red-100 text-red-700 text-sm font-medium hover:bg-red-200"
          >
            <RefreshCw className="w-4 h-4" />
            재시도
          </button>
        </div>
      )}

      {/* 미수금 요약 카드 — 대시보드 통계와 동일한 receivableTotal/receivableCount 사용 */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl border border-amber-200 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <h2 className="font-semibold text-amber-800">미수금 현황</h2>
          </div>
          <Link
            href="/partner/unpaid-pay"
            className="flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800 hover:underline"
          >
            결제하기
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <p className="text-2xl font-bold text-amber-700 mt-2">{fmt(total)}</p>
        <p className="text-sm text-amber-600 mt-0.5">
          {list.length}건 · 대시보드 미수금 통계와 동일
        </p>
      </div>

      {/* 미수금 상세 테이블: 고객명, 예약일자, 금액, 미수 상태 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between bg-gray-50/80">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-amber-500" />
            <span className="font-semibold">미수금 상세 목록</span>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="p-2 rounded-lg hover:bg-gray-200 transition-colors"
            title="새로고침"
          >
            <RefreshCw className={`w-4 h-4 text-gray-500 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {list.length === 0 ? (
          <div className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-amber-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">미수금이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">
              예약 완료 시 자동으로 미수금이 생성됩니다
            </p>
          </div>
        ) : (
          <>
            {/* 데스크톱: 테이블 (고객명, 예약일자, 금액, 미수 상태) */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-4 font-medium text-gray-600">고객명</th>
                    <th className="text-left p-4 font-medium text-gray-600">예약일자</th>
                    <th className="text-right p-4 font-medium text-gray-600">금액</th>
                    <th className="text-center p-4 font-medium text-gray-600">미수 상태</th>
                    <th className="text-center p-4 font-medium text-gray-600">상세</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/50">
                      <td className="p-4">
                        <span className="font-medium text-gray-800">{r.customer_name}</span>
                        {r.customer_phone && (
                          <p className="text-xs text-gray-500 mt-0.5">{r.customer_phone}</p>
                        )}
                      </td>
                      <td className="p-4 text-gray-600">
                        {r.reservation_date
                          ? new Date(r.reservation_date).toLocaleDateString('ko-KR')
                          : '-'}
                      </td>
                      <td className="p-4 text-right font-semibold text-amber-700">
                        {fmt(r.amount)}
                      </td>
                      <td className="p-4 text-center">
                        <span className="px-2 py-1 rounded-md bg-amber-100 text-amber-700 text-xs font-medium">
                          {RECEIVABLE_STATUS}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <Link
                          href={`/partner/assignments?sr=${r.service_request_id}`}
                          className="inline-flex items-center gap-1 text-brand-primary hover:underline text-xs font-medium"
                        >
                          DB 상세
                          <ExternalLink className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 모바일: 카드 */}
            <div className="md:hidden p-4 space-y-3">
              {list.map((r) => (
                <ReceivableCard key={r.id} r={r} fmt={fmt} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* 하단 안내 */}
      <div className="flex gap-3">
        <Link
          href="/partner/unpaid-pay"
          className="flex-1 py-3 text-center bg-brand-primary text-white rounded-xl font-medium hover:opacity-90 transition-opacity"
        >
          미수금 결제하기
        </Link>
        <Link
          href="/partner/dashboard"
          className="flex-1 py-3 text-center border border-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition-colors"
        >
          대시보드로
        </Link>
      </div>
    </div>
  );
}
