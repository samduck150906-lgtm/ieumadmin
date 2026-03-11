'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Share2, ArrowRight, Database, RefreshCw } from 'lucide-react';

/** 제휴업체 매칭 현황 — 공인중개사/제휴업체가 배정·매칭된 건을 확인 */
export default function PartnerMatchingPage() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{
    total: number;
    byStatus: Record<string, number>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    async function load() {
      setLoading(true);
      setError(null);
      try {
        if (!supabase) {
          setError('Supabase client is not available');
          return;
        }
        const client = supabase;
        const { data: sessionData } = await client.auth.getSession();
        const token = sessionData.session?.access_token;
        const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

        const res = await fetch('/api/partner/dashboard-stats', { headers });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `조회 실패 (${res.status})`);
        }
        const stats = await res.json();
        const pipeline = stats.pipelineCounts || {};
        const total = stats.totalPipeline ?? 0;
        setSummary({ total, byStatus: pipeline });
      } catch (e) {
        setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const STATUS_LABELS: Record<string, string> = {
    unread: '상담전',
    read: '진행중',
    consulting: '상담중',
    visiting: '방문상담',
    reserved: '예약완료',
    absent: '부재중',
    completed: '완료',
    cancelled: '취소',
    pending: '보류',
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">제휴업체 매칭 현황</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          배정된 DB·상담 건의 상태별 현황을 확인할 수 있습니다.
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl shadow-card p-8 border border-gray-100">
          <div className="flex items-center justify-center gap-3 text-gray-500">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span>로딩 중...</span>
          </div>
        </div>
      ) : error ? (
        <div className="bg-amber-50 rounded-2xl p-6 border border-amber-200">
          <p className="text-amber-800">{error}</p>
          <Link
            href="/partner/assignments"
            className="inline-flex items-center gap-2 mt-4 text-amber-700 hover:text-amber-900 font-medium"
          >
            DB 관리에서 직접 확인하기
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Link
              href="/partner/assignments"
              className="flex items-center gap-4 p-5 rounded-2xl border-2 border-brand-primary/20 bg-brand-primary/5 hover:bg-brand-primary/10 transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-brand-primary/20 flex items-center justify-center group-hover:bg-brand-primary/30">
                <Database className="w-6 h-6 text-brand-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">DB 관리</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  배정 건수: {summary?.total ?? 0}건
                </p>
              </div>
              <ArrowRight className="w-5 h-5 text-brand-primary shrink-0" />
            </Link>
            <Link
              href="/partner/db-list"
              className="flex items-center gap-4 p-5 rounded-2xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors group"
            >
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center group-hover:bg-gray-200">
                <Share2 className="w-6 h-6 text-gray-600" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-gray-900">DB 구매</p>
                <p className="text-xs text-gray-500 mt-0.5">마일리지로 DB 열람</p>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-400 shrink-0" />
            </Link>
          </div>

          {summary && summary.total > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-5 border border-gray-100">
              <h2 className="font-semibold text-gray-900 mb-4">상태별 현황</h2>
              <div className="flex flex-wrap gap-2">
                {Object.entries(summary.byStatus)
                  .filter(([, count]) => count > 0)
                  .map(([status, count]) => (
                    <span
                      key={status}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm"
                    >
                      {STATUS_LABELS[status] ?? status}: {count}
                    </span>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
