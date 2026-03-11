'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  RefreshCw,
  Building2,
  Phone,
  Mail,
  Star,
  Wallet,
  TrendingUp,
  AlertCircle,
  CreditCard,
} from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAuthHeaders } from '@/lib/auth-headers';

const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  moving: '이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  kiosk: '키오스크',
  etc: '기타',
};

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

const STATUS_COLORS: Record<string, string> = {
  unread: 'bg-red-50 text-red-700',
  read: 'bg-blue-50 text-blue-700',
  consulting: 'bg-indigo-50 text-indigo-700',
  visiting: 'bg-purple-50 text-purple-700',
  reserved: 'bg-green-50 text-green-700',
  absent: 'bg-orange-50 text-orange-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-gray-100 text-gray-500',
  pending: 'bg-yellow-50 text-yellow-700',
};

interface PartnerDetail {
  id: string;
  user_id: string;
  business_name: string | null;
  representative_name: string | null;
  business_number: string | null;
  address: string | null;
  contact_phone: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  manager_email: string | null;
  service_categories: string[] | null;
  avg_rating: number | null;
  total_reviews: number | null;
  created_at: string;
  updated_at: string;
  user: {
    id: string;
    email: string | null;
    name: string | null;
    status: string;
    created_at: string;
  } | null;
  mileage: {
    balance: number;
    totalEarned: number;
    totalUsed: number;
  };
  stats: {
    assignmentCounts: Record<string, number>;
    totalAssignments: number;
    totalViewPay: number;
    totalReceivable: number;
  };
}

function fmt(n: number) {
  return `₩${n.toLocaleString()}`;
}

export default function PartnerDetailClient({ id }: { id: string }) {
  const [partner, setPartner] = useState<PartnerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const authHeaders = useAuthHeaders();

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/partners/${id}`, { headers: authHeaders });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '조회 실패');
      }
      const data = await res.json();
      setPartner(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }, [id, authHeaders]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/members/partners"
              className="flex items-center gap-1 text-gray-600 hover:text-gray-900"
            >
              <ChevronLeft className="h-5 w-5" />
              목록
            </Link>
            <div className="flex items-center gap-2">
              <Building2 className="h-6 w-6 text-brand-primary" />
              <h1 className="text-2xl font-bold text-gray-900">
                {partner?.business_name ?? '제휴업체 상세'}
              </h1>
            </div>
          </div>
          <button
            type="button"
            onClick={loadDetail}
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
            새로고침
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <RefreshCw className="h-8 w-8 animate-spin text-brand-primary" />
          </div>
        ) : error ? (
          <Card>
            <CardBody>
              <div className="flex items-center gap-2 text-red-600 mb-4">
                <AlertCircle className="h-5 w-5" />
                <p>{error}</p>
              </div>
              <button
                type="button"
                onClick={loadDetail}
                className="text-brand-primary hover:underline text-sm"
              >
                다시 시도
              </button>
            </CardBody>
          </Card>
        ) : partner ? (
          <div className="space-y-6">
            {/* 요약 카드 4개 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <Wallet className="h-4 w-4 text-amber-500" />
                  <span className="text-xs text-gray-500">마일리지 잔액</span>
                </div>
                <p className="text-xl font-bold text-amber-600">{fmt(partner.mileage.balance)}</p>
                <p className="text-xs text-gray-400 mt-0.5">누적 {fmt(partner.mileage.totalEarned)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-gray-500">미수금</span>
                </div>
                <p className="text-xl font-bold text-red-600">{fmt(partner.stats.totalReceivable)}</p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-gray-500">총 배정 건수</span>
                </div>
                <p className="text-xl font-bold text-blue-600">{partner.stats.totalAssignments}건</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  완료 {partner.stats.assignmentCounts['completed'] ?? 0}건
                </p>
              </div>
              <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-1">
                  <CreditCard className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-gray-500">DB 열람 결제액</span>
                </div>
                <p className="text-xl font-bold text-purple-600">{fmt(partner.stats.totalViewPay)}</p>
              </div>
            </div>

            {/* 기본 정보 + 회원 정보 */}
            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardBody>
                  <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-brand-primary" />
                    업체 기본 정보
                  </h2>
                  <dl className="space-y-3 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 shrink-0">업체명</dt>
                      <dd className="font-medium text-right">{partner.business_name || '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 shrink-0">대표자</dt>
                      <dd className="text-right">{partner.representative_name || '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 shrink-0">사업자번호</dt>
                      <dd className="font-mono text-right">{partner.business_number || '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 shrink-0">주소</dt>
                      <dd className="text-right">{partner.address || '-'}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 shrink-0">대표 연락처</dt>
                      <dd className="text-right">
                        {partner.contact_phone ? (
                          <a href={`tel:${partner.contact_phone}`} className="flex items-center justify-end gap-1 text-brand-primary">
                            <Phone className="h-3.5 w-3.5" />
                            {partner.contact_phone}
                          </a>
                        ) : '-'}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 shrink-0">가입일</dt>
                      <dd className="text-right">{new Date(partner.created_at).toLocaleDateString('ko-KR')}</dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-gray-500 shrink-0">업종</dt>
                      <dd className="text-right">
                        <div className="flex flex-wrap justify-end gap-1">
                          {(partner.service_categories ?? []).map((cat) => (
                            <span
                              key={cat}
                              className="inline-flex px-2 py-0.5 text-xs bg-brand-primary/10 text-brand-primary rounded-full font-medium"
                            >
                              {SERVICE_CATEGORY_LABELS[cat] ?? cat}
                            </span>
                          ))}
                          {(!partner.service_categories || partner.service_categories.length === 0) && '-'}
                        </div>
                      </dd>
                    </div>
                    {(partner.avg_rating != null && (partner.total_reviews ?? 0) > 0) && (
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500 shrink-0">평균 평점</dt>
                        <dd className="flex items-center gap-1 justify-end">
                          <Star className="h-3.5 w-3.5 text-yellow-400 fill-yellow-400" />
                          <span className="font-medium">{Number(partner.avg_rating).toFixed(1)}</span>
                          <span className="text-gray-400">({partner.total_reviews}건)</span>
                        </dd>
                      </div>
                    )}
                  </dl>
                </CardBody>
              </Card>

              <div className="space-y-4">
                <Card>
                  <CardBody>
                    <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Mail className="h-4 w-4 text-brand-primary" />
                      담당자 / 로그인 정보
                    </h2>
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500 shrink-0">담당자</dt>
                        <dd className="text-right">{partner.manager_name || '-'}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500 shrink-0">담당자 연락처</dt>
                        <dd className="text-right">
                          {partner.manager_phone ? (
                            <a href={`tel:${partner.manager_phone}`} className="flex items-center justify-end gap-1 text-brand-primary">
                              <Phone className="h-3.5 w-3.5" />
                              {partner.manager_phone}
                            </a>
                          ) : '-'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500 shrink-0">담당자 이메일</dt>
                        <dd className="text-right">
                          {partner.manager_email ? (
                            <a href={`mailto:${partner.manager_email}`} className="flex items-center justify-end gap-1 text-brand-primary">
                              <Mail className="h-3.5 w-3.5" />
                              {partner.manager_email}
                            </a>
                          ) : '-'}
                        </dd>
                      </div>
                      <div className="border-t border-gray-100 pt-3 mt-1">
                        <div className="flex justify-between gap-4 mb-2">
                          <dt className="text-gray-500 shrink-0">로그인 이메일</dt>
                          <dd className="text-right text-gray-700">{partner.user?.email || '-'}</dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt className="text-gray-500 shrink-0">계정 상태</dt>
                          <dd className="text-right">
                            <StatusBadge status={partner.user?.status ?? ''} type="user" />
                          </dd>
                        </div>
                      </div>
                    </dl>
                  </CardBody>
                </Card>

                <Card>
                  <CardBody>
                    <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Wallet className="h-4 w-4 text-amber-500" />
                      마일리지
                    </h2>
                    <dl className="space-y-3 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">현재 잔액</dt>
                        <dd className="font-semibold text-amber-600">{fmt(partner.mileage.balance)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">총 적립액</dt>
                        <dd className="text-green-600">{fmt(partner.mileage.totalEarned)}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-gray-500">총 사용액</dt>
                        <dd className="text-gray-600">{fmt(partner.mileage.totalUsed)}</dd>
                      </div>
                    </dl>
                  </CardBody>
                </Card>
              </div>
            </div>

            {/* DB 배정 파이프라인 */}
            <Card>
              <CardBody>
                <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  DB 배정 현황 (전체 누적)
                </h2>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {Object.entries(STATUS_LABELS).map(([status, label]) => {
                    const count = partner.stats.assignmentCounts[status] ?? 0;
                    return (
                      <div
                        key={status}
                        className={`rounded-xl px-3 py-3 text-center ${STATUS_COLORS[status] ?? 'bg-gray-50 text-gray-500'}`}
                      >
                        <p className="text-lg font-bold">{count}</p>
                        <p className="text-xs mt-0.5">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </CardBody>
            </Card>
          </div>
        ) : null}
      </div>
    </AdminLayout>
  );
}
