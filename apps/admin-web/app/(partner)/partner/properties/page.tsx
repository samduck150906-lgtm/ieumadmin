'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import {
  Home,
  RefreshCw,
  Search,
  BarChart3,
  Send,
  Users,
  ChevronLeft,
  ChevronRight,
  Filter,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { Property } from '@/types/property';

const STATUS_OPTIONS = [
  { value: '', label: '전체 상태' },
  { value: 'available', label: '판매중' },
  { value: 'reserved', label: '예약중' },
  { value: 'contracted', label: '완료' },
  { value: 'hidden', label: '숨김' },
];

/** 매물 상태 → 화면 표시 (판매중/완료) */
const STATUS_DISPLAY: Record<string, string> = {
  available: '판매중',
  reserved: '예약중',
  contracted: '완료',
  hidden: '숨김',
};

/** 내 매물 관리 — 공인중개사 전용. 매물 목록·상태·주소·등록일 확인 */
export default function PartnerPropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const loadProperties = useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setError('로그인이 필요합니다.');
        setProperties([]);
        return;
      }

      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', '20');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/partner/properties?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError((body as { error?: string }).error || `목록을 불러오지 못했습니다. (${res.status})`);
        setProperties([]);
        return;
      }

      const json = await res.json();
      setProperties(json.data ?? []);
      setTotalPages(json.meta?.totalPages ?? 0);
      setTotal(json.meta?.total ?? 0);
    } catch {
      setError('네트워크 오류가 발생했습니다. 다시 시도해 주세요.');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    loadProperties();
  }, [loadProperties]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">내 매물 관리</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          등록한 매물의 상태, 주소, 등록일을 확인할 수 있습니다.
        </p>
      </div>

      {/* 검색·필터 — 모바일: 필터 버튼 클릭 시 펼침 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        {/* 모바일: 필터 버튼 */}
        <div className="md:hidden flex items-center justify-between p-4 border-b border-gray-100">
          <button
            type="button"
            onClick={() => setFilterOpen(!filterOpen)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700"
          >
            <Filter className="w-4 h-4" />
            필터 {filterOpen ? '접기' : '펼치기'}
            {filterOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
          <button
            type="button"
            onClick={loadProperties}
            className="p-2 rounded-xl bg-gray-100 hover:bg-gray-200"
            aria-label="새로고침"
          >
            <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        {/* 필터 영역 — 데스크톱: 항상 표시, 모바일: 펼침 시만 */}
        <div className={`p-4 ${filterOpen ? 'block' : 'hidden md:block'}`}>
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="주소·단지명 검색"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30 focus:border-brand-primary"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value || 'all'} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="hidden sm:block">
              <button
                type="button"
                onClick={loadProperties}
                className="p-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors"
                aria-label="새로고침"
              >
                <RefreshCw className={`w-4 h-4 text-gray-600 ${loading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 매물 목록 */}
      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="border-b bg-gray-50/80 px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600">매물 목록</span>
          <span className="text-xs text-gray-500">
            총 {total}건
          </span>
        </div>
        <div className="p-4">
          {error ? (
            <div className="py-12 text-center">
              <p className="text-sm text-red-600">{error}</p>
              <p className="text-xs text-gray-500 mt-1">페이지를 새로고침하거나 잠시 후 다시 시도해 주세요.</p>
              <button
                type="button"
                onClick={loadProperties}
                className="mt-3 px-4 py-2 bg-brand-primary text-white text-sm rounded-xl hover:bg-blue-700"
              >
                다시 시도
              </button>
            </div>
          ) : loading ? (
            <div className="flex justify-center py-16">
              <RefreshCw className="w-6 h-6 text-brand-primary animate-spin" />
            </div>
          ) : properties.length === 0 ? (
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="text-left py-3 px-4 font-medium text-gray-600">상태</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">주소</th>
                    <th className="text-left py-3 px-4 font-medium text-gray-600">등록일</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td colSpan={3} className="py-16 text-center">
                      <Home className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                      <p className="text-gray-500 font-medium">등록된 매물이 없습니다</p>
                      <p className="text-xs text-gray-400 mt-1">매물 등록·수정은 이음 모바일 앱에서 진행해 주세요.</p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        <Link
                          href="/partner/settlements"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-brand-primary/30 text-brand-primary text-sm font-medium hover:bg-brand-primary/5"
                        >
                          <BarChart3 className="w-4 h-4" />
                          내 수익 현황
                        </Link>
                        <Link
                          href="/partner/invite"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
                        >
                          <Send className="w-4 h-4" />
                          고객 초대
                        </Link>
                        <Link
                          href="/partner/invitations"
                          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50"
                        >
                          <Users className="w-4 h-4" />
                          추천인 관리
                        </Link>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <>
              {/* 데스크톱: 테이블 */}
              <div className="hidden md:block overflow-x-auto -mx-4 sm:mx-0">
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 bg-gray-50/80">
                      <th className="text-left py-3 px-4 font-medium text-gray-600">상태</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">주소</th>
                      <th className="text-left py-3 px-4 font-medium text-gray-600">등록일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {properties.map((p) => (
                      <tr
                        key={p.id}
                        className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <span className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap bg-gray-100 text-gray-700">
                            {STATUS_DISPLAY[p.status] ?? p.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-gray-800">{p.address || '-'}</td>
                        <td className="py-3 px-4 text-gray-600">
                          {new Date(p.createdAt).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 모바일: 카드 */}
              <div className="md:hidden p-4 space-y-3">
                {properties.map((p) => (
                  <div
                    key={p.id}
                    className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-800 truncate">{p.address || '-'}</p>
                        <p className="text-sm text-gray-500 mt-0.5">
                          {new Date(p.createdAt).toLocaleDateString('ko-KR', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                          })}
                        </p>
                      </div>
                      <span className="shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium bg-gray-100 text-gray-700">
                        {STATUS_DISPLAY[p.status] ?? p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 페이지네이션 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-4 pt-4 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={page <= 1}
                    className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm text-gray-600">
                    {page} / {totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={page >= totalPages}
                    className="p-2 rounded-lg border border-gray-200 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 모바일 앱 안내 (보조) */}
      <p className="text-xs text-gray-500">
        매물 등록·수정·삭제는 이음 모바일 앱에서 진행해 주세요. 웹에서는 목록 조회와 수익·정산 현황을 확인할 수 있습니다.
      </p>
    </div>
  );
}
