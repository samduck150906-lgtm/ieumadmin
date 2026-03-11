'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate } from '@/utils/format';
import { useAuth } from '@/lib/auth';
import {
  RefreshCw,
  Users,
  TrendingUp,
  Clock,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  UserPlus,
  AlertCircle,
  Download,
} from 'lucide-react';

interface ReferralStats {
  total_referral_amount: number;
  settled_amount: number;
  unsettled_amount: number;
  this_month_amount: number;
  active_referrals: number;
  expired_referrals: number;
}

interface ReferralCommission {
  id: string;
  amount: number;
  isSettled: boolean;
  settledAt: string | null;
  createdAt: string;
  serviceRequestId: string | null;
  referrer: {
    id: string;
    businessName: string;
    contactName: string | null;
  } | null;
  referred: {
    id: string;
    businessName: string;
    contactName: string | null;
    expiresAt: string | null;
    isActive: boolean;
  } | null;
}

interface ReferralPolicy {
  referralPct: number;
  referralDurationMonths: number;
}

interface ReferralRelation {
  id: string;
  businessName: string;
  contactName: string | null;
  referrerId: string;
  referrerName: string | null;
  referrerContactName: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

type StatusFilterType = 'all' | 'active' | 'expired';

export default function AdminReferralCommissionsPage() {
  const { session } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [policy, setPolicy] = useState<ReferralPolicy>({ referralPct: 5, referralDurationMonths: 12 });
  const [commissions, setCommissions] = useState<ReferralCommission[]>([]);
  const [relations, setRelations] = useState<ReferralRelation[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [statusFilter, setStatusFilter] = useState<StatusFilterType>('all');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'commissions' | 'relations'>('commissions');

  const loadData = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '20',
        status: statusFilter,
      });
      const res = await fetch(`/api/admin/referral-commissions?${params}`, {
        credentials: 'same-origin',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const message =
          res.status === 401
            ? data.error ||
              '로그인 세션이 만료되었거나 권한이 없습니다. 새로고침 후 다시 시도하거나 로그인해 주세요.'
            : data.error || '데이터를 불러오지 못했습니다.';
        throw new Error(message);
      }
      const data = await res.json();
      setStats(data.stats);
      setPolicy(data.policy ?? { referralPct: 5, referralDurationMonths: 12 });
      setCommissions(data.data);
      setRelations(data.referralRelations ?? []);
      setTotal(data.meta.total);
      setTotalPages(data.meta.totalPages);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, page, statusFilter]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const formatMoney = (amount: number) => new Intl.NumberFormat('ko-KR').format(amount) + '원';

  const getDaysRemaining = (expiresAt: string | null) => {
    if (!expiresAt) return null;
    const expires = new Date(expiresAt);
    const now = new Date();
    const diff = Math.ceil((expires.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">추천 수수료 관리</h1>
          <p className="mt-1 text-sm text-gray-500">
            공인중개사 초대 추천인 수익금 5% 적립 현황 (가입일로부터 1년간)
          </p>
        </div>
        <Button onClick={loadData} variant="secondary" disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* 정책 안내 */}
      <Card className="bg-blue-50 border-blue-200">
        <CardBody className="text-sm text-blue-800">
          <p className="font-medium mb-1">추천 수익금 정책</p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-700">
            <li>
              회원 공인중개사가 타 공인중개사를 초대하여 가입 시, 피추천인의 정산금(수익금)의{' '}
              <strong>{policy.referralPct}%</strong>를 추천인에게 적립
            </li>
            <li>적용 대상: 상담요청 수수료(consultation) + 전체완료 수수료(conversion)</li>
            <li>적용 기간: 추천 및 가입일로부터 <strong>{policy.referralDurationMonths}개월</strong>간</li>
            <li>추천 수수료는 원 수수료 발생 시 자동으로 DB 트리거에 의해 생성됩니다</li>
          </ul>
        </CardBody>
      </Card>

      {/* 통계 카드 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <Card>
            <CardBody className="text-center">
              <TrendingUp className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-xs text-gray-500">총 추천 수익금</p>
              <p className="text-lg font-bold text-gray-900">{formatMoney(stats.total_referral_amount)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <CheckCircle className="h-5 w-5 text-blue-600 mx-auto mb-1" />
              <p className="text-xs text-gray-500">정산 완료</p>
              <p className="text-lg font-bold text-gray-900">{formatMoney(stats.settled_amount)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <Clock className="h-5 w-5 text-yellow-600 mx-auto mb-1" />
              <p className="text-xs text-gray-500">미정산</p>
              <p className="text-lg font-bold text-gray-900">{formatMoney(stats.unsettled_amount)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <TrendingUp className="h-5 w-5 text-purple-600 mx-auto mb-1" />
              <p className="text-xs text-gray-500">이번 달</p>
              <p className="text-lg font-bold text-gray-900">{formatMoney(stats.this_month_amount)}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <Users className="h-5 w-5 text-green-600 mx-auto mb-1" />
              <p className="text-xs text-gray-500">활성 추천</p>
              <p className="text-lg font-bold text-gray-900">{stats.active_referrals}건</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody className="text-center">
              <AlertCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
              <p className="text-xs text-gray-500">만료 추천</p>
              <p className="text-lg font-bold text-gray-900">{stats.expired_referrals}건</p>
            </CardBody>
          </Card>
        </div>
      )}

      {/* 탭 */}
      <div className="flex gap-2 border-b border-gray-200 pb-0">
        <button
          onClick={() => setActiveTab('commissions')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'commissions'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          추천 수수료 내역
        </button>
        <button
          onClick={() => setActiveTab('relations')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'relations'
              ? 'border-brand-600 text-brand-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          추천 관계 현황 ({relations.length})
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-red-800 flex-1 min-w-0">{error}</p>
          <div className="flex items-center gap-2 shrink-0">
            {error.includes('로그인') || error.includes('권한') ? (
              <Button variant="primary" size="sm" onClick={() => window.location.assign('/login')}>
                다시 로그인
              </Button>
            ) : null}
            <Button variant="secondary" size="sm" onClick={loadData}>
              <RefreshCw className="h-4 w-4 mr-2" /> 다시 시도
            </Button>
          </div>
        </div>
      )}

      {/* 추천 수수료 내역 탭 */}
      {activeTab === 'commissions' && (
        <Card>
          <CardBody className="space-y-4">
            {/* 필터 + 내보내기 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'all' as StatusFilterType, label: '전체' },
                  { value: 'active' as StatusFilterType, label: '활성 (1년 이내)' },
                  { value: 'expired' as StatusFilterType, label: '만료' },
                ].map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    statusFilter === f.value
                      ? 'bg-brand-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              </div>
              {/* CSV: 로딩과 무관하게 항상 클릭 가능 */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const BOM = '\uFEFF';
                  const headers = ['일시', '추천인(수익수령)', '피추천인(가입자)', '추천수수료', '추천상태', '정산'];
                  const rows = commissions.map((c) => [
                    formatDate(c.createdAt),
                    c.referrer?.businessName ?? '-',
                    c.referred?.businessName ?? '-',
                    String(c.amount),
                    c.referred?.isActive ? '활성' : '만료',
                    c.isSettled ? '완료' : '대기',
                  ]);
                  const csv = BOM + [headers, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
                  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `추천수수료_${new Date().toISOString().slice(0, 10)}.csv`;
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
              >
                <Download className="h-4 w-4 mr-2" />현재 목록 내보내기(CSV)
              </Button>
            </div>

            {/* 테이블 */}
            {loading ? (
              <div className="flex justify-center py-12">
                <RefreshCw className="h-8 w-8 animate-spin text-brand-600" />
              </div>
            ) : commissions.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <UserPlus className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium">추천 수수료 내역이 없습니다</p>
                <p className="text-sm mt-1">공인중개사가 타 공인중개사를 초대하면 수수료가 자동 생성됩니다</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-gray-500">
                        <th className="pb-3 pr-4 font-medium">일시</th>
                        <th className="pb-3 pr-4 font-medium">추천인 (수익 수령)</th>
                        <th className="pb-3 pr-4 font-medium">피추천인 (가입자)</th>
                        <th className="pb-3 pr-4 font-medium text-right">추천 수수료</th>
                        <th className="pb-3 pr-4 font-medium">추천 상태</th>
                        <th className="pb-3 font-medium">정산</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map((c) => {
                        const daysRemaining = c.referred?.expiresAt
                          ? getDaysRemaining(c.referred.expiresAt)
                          : null;
                        return (
                          <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-3 pr-4 text-gray-600 whitespace-nowrap">
                              {formatDate(c.createdAt)}
                            </td>
                            <td className="py-3 pr-4">
                              <div className="font-medium text-gray-900">
                                {c.referrer?.businessName ?? '-'}
                              </div>
                              <div className="text-xs text-gray-500">{c.referrer?.contactName ?? ''}</div>
                            </td>
                            <td className="py-3 pr-4">
                              <div className="font-medium text-gray-900">
                                {c.referred?.businessName ?? '-'}
                              </div>
                              <div className="text-xs text-gray-500">{c.referred?.contactName ?? ''}</div>
                            </td>
                            <td className="py-3 pr-4 text-right font-medium text-gray-900">
                              {formatCurrency(c.amount)}
                            </td>
                            <td className="py-3 pr-4">
                              {c.referred?.isActive ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                                  활성
                                  {daysRemaining != null && daysRemaining <= 90 && (
                                    <span className="text-yellow-600 ml-1">({daysRemaining}일 남음)</span>
                                  )}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
                                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full" />
                                  만료
                                </span>
                              )}
                            </td>
                            <td className="py-3">
                              <StatusBadge
                                status={c.isSettled ? 'completed' : 'pending'}
                                type="settlement"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between pt-4">
                    <span className="text-sm text-gray-500">총 {total}건</span>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage(page - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-gray-700">
                        {page} / {totalPages}
                      </span>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={page >= totalPages}
                        onClick={() => setPage(page + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </CardBody>
        </Card>
      )}

      {/* 추천 관계 현황 탭 */}
      {activeTab === 'relations' && (
        <Card>
          <CardBody className="space-y-4">
            {relations.length > 0 && (
              <div className="flex justify-end">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const BOM = '\uFEFF';
                    const headers = ['추천인(수익수령)', '피추천인(가입자)', '가입일', '추천만료일', '남은기간', '상태'];
                    const rows = relations.map((r) => {
                      const daysRemaining = getDaysRemaining(r.expiresAt);
                      return [
                        r.referrerName ?? '-',
                        r.businessName ?? '-',
                        formatDate(r.createdAt),
                        r.expiresAt ? formatDate(r.expiresAt) : '-',
                        daysRemaining != null ? (daysRemaining <= 0 ? '만료' : `${daysRemaining}일`) : '-',
                        r.isActive ? '활성' : '만료',
                      ];
                    });
                    const csv = BOM + [headers, ...rows].map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(',')).join('\n');
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
                    const a = document.createElement('a');
                    a.href = URL.createObjectURL(blob);
                    a.download = `추천관계_${new Date().toISOString().slice(0, 10)}.csv`;
                    a.click();
                    URL.revokeObjectURL(a.href);
                  }}
                >
                  <Download className="h-4 w-4 mr-2" />현재 목록 내보내기(CSV)
                </Button>
              </div>
            )}
            {relations.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <Users className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="font-medium">추천 관계가 없습니다</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-gray-500">
                      <th className="pb-3 pr-4 font-medium">추천인 (수익 수령)</th>
                      <th className="pb-3 pr-4 font-medium">피추천인 (가입자)</th>
                      <th className="pb-3 pr-4 font-medium">가입일</th>
                      <th className="pb-3 pr-4 font-medium">추천 만료일</th>
                      <th className="pb-3 pr-4 font-medium">남은 기간</th>
                      <th className="pb-3 font-medium">상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {relations.map((r) => {
                      const daysRemaining = getDaysRemaining(r.expiresAt);
                      return (
                        <tr key={r.id} className="border-b last:border-0 hover:bg-gray-50">
                          <td className="py-3 pr-4">
                            <div className="font-medium text-gray-900">{r.referrerName ?? '-'}</div>
                            <div className="text-xs text-gray-500">{r.referrerContactName ?? ''}</div>
                          </td>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-gray-900">{r.businessName}</div>
                            <div className="text-xs text-gray-500">{r.contactName ?? ''}</div>
                          </td>
                          <td className="py-3 pr-4 text-gray-600">
                            {formatDate(r.createdAt)}
                          </td>
                          <td className="py-3 pr-4 text-gray-600">
                            {r.expiresAt ? formatDate(r.expiresAt) : '-'}
                          </td>
                          <td className="py-3 pr-4">
                            {daysRemaining != null ? (
                              <span
                                className={`text-sm font-medium ${
                                  daysRemaining <= 0
                                    ? 'text-red-600'
                                    : daysRemaining <= 90
                                      ? 'text-yellow-600'
                                      : 'text-green-600'
                                }`}
                              >
                                {daysRemaining <= 0 ? '만료' : `${daysRemaining}일`}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="py-3">
                            {r.isActive ? (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-1 rounded-full">
                                활성
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-1 rounded-full">
                                만료
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
