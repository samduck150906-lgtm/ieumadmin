'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useUserDetail, useUserStatusUpdate } from '@/hooks/useUsers';
import { formatDate, formatPhone, formatCurrency } from '@/utils/format';
import { getSupabase } from '@/lib/supabase';
import { ArrowLeft, UserPlus, Percent, CreditCard, Activity } from 'lucide-react';

const ROLE_LABELS: Record<string, string> = {
  super_admin: '최고관리자',
  admin: '관리자',
  manager: '매니저',
  viewer: '뷰어',
};

const PROVIDER_LABELS: Record<string, string> = {
  kakao: '카카오',
  apple: '애플',
  email: '이메일',
};

type UserTab = 'invitations' | 'commissions' | 'payments' | 'activity';

interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  completed_at: string | null;
  partner?: { business_name: string } | { business_name: string }[];
}

interface AuditRow {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

const TAB_CONFIG: { key: UserTab; label: string; icon: React.ElementType }[] = [
  { key: 'invitations', label: '초대내역', icon: UserPlus },
  { key: 'commissions', label: '수수료', icon: Percent },
  { key: 'payments', label: '결제내역', icon: CreditCard },
  { key: 'activity', label: '활동로그', icon: Activity },
];

export default function AdminUserDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : null;
  const { data: user, isLoading } = useUserDetail(id);
  const statusUpdate = useUserStatusUpdate();

  const handleStatusChange = (status: 'active' | 'suspended' | 'terminated') => {
    if (!id) return;
    const labels = { active: '활성화', suspended: '정지', terminated: '해지' };
    if (status !== 'active' && !confirm(`이 회원을 '${labels[status]}' 상태로 변경하시겠습니까?`)) return;
    statusUpdate.mutate({ id, status });
  };
  const [activeTab, setActiveTab] = useState<UserTab>('payments');
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const fetchTabData = useCallback(async (userId: string, tab: UserTab) => {
    setTabLoading(true);
    try {
      const supabase = getSupabase();
      switch (tab) {
        case 'invitations':
        case 'commissions':
          // 직원(스태프)은 초대/수수료 이력 없음
          break;
        case 'payments': {
          const { data } = await supabase
            .from('partner_payment_requests')
            .select(`
              id, amount, status, created_at, completed_at,
              partner:partners!partner_payment_requests_partner_id_fkey (business_name)
            `)
            .eq('requested_by', userId)
            .order('created_at', { ascending: false })
            .limit(50);
          setPayments((data ?? []) as PaymentRow[]);
          break;
        }
        case 'activity': {
          const { data } = await supabase
            .from('audit_logs')
            .select('id, action, resource_type, resource_id, created_at')
            .eq('actor_type', 'staff')
            .eq('actor_id', userId)
            .order('created_at', { ascending: false })
            .limit(30);
          setAuditLogs((data ?? []) as AuditRow[]);
          break;
        }
      }
    } catch (e) {
      console.error('탭 데이터 로드 실패:', e);
    } finally {
      setTabLoading(false);
    }
  }, []);

  useEffect(() => {
    if (id) fetchTabData(id, activeTab);
  }, [id, activeTab, fetchTabData]);

  if (isLoading || !user) {
    return (
      <div className="space-y-6">
        <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> 회원 관리
        </Link>
        <p className="text-gray-500">로딩 중이거나 회원을 찾을 수 없습니다.</p>
      </div>
    );
  }

  const detail = 'invitedCustomers' in user ? user : Object.assign({}, user, { invitedCustomers: 0, invitedPartners: 0, totalCommission: 0, recentActivity: [] as never[] });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/users" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600">
            <ArrowLeft className="h-4 w-4" /> 회원 관리 / {user.name}
          </Link>
          <StatusBadge status={user.status} type="user" />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange('active')}
            disabled={statusUpdate.isPending || user.status === 'active'}
          >
            활성화
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleStatusChange('suspended')}
            disabled={statusUpdate.isPending || user.status === 'suspended'}
          >
            정지
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleStatusChange('terminated')}
            disabled={statusUpdate.isPending || user.status === 'terminated'}
          >
            해지
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>프로필</CardHeader>
          <CardBody className="space-y-3">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xl font-semibold">
                {user.name?.charAt(0) ?? '?'}
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{user.name}</h2>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-gray-500">전화</dt>
              <dd>{formatPhone(user.phone)}</dd>
              <dt className="text-gray-500">가입경로</dt>
              <dd>{PROVIDER_LABELS[user.provider] ?? user.provider}</dd>
              <dt className="text-gray-500">가입일</dt>
              <dd>{formatDate(user.createdAt)}</dd>
              <dt className="text-gray-500">상태</dt>
              <dd><StatusBadge status={user.status} type="user" /></dd>
              <dt className="text-gray-500">역할</dt>
              <dd>{ROLE_LABELS[user.role] ?? user.role}</dd>
              <dt className="text-gray-500">최근 접속</dt>
              <dd>{formatDate(user.lastLoginAt)}</dd>
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>활동 요약</CardHeader>
          <CardBody className="space-y-3">
            <p className="text-sm text-gray-600">초대 고객: {detail.invitedCustomers}명</p>
            <p className="text-sm text-gray-600">초대 파트너: {detail.invitedPartners}명</p>
            <p className="text-sm text-gray-600">총 수수료: {formatCurrency(detail.totalCommission)}</p>
            <p className="text-sm text-gray-500">아래 탭에서 상세 내역을 확인할 수 있습니다.</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center gap-2">
          <div className="flex flex-wrap gap-1 border-b border-neutral-200/60 -mb-px sm:mb-0 sm:border-0">
            {TAB_CONFIG.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === key
                    ? 'bg-brand-50 text-brand-700 border-b-2 border-brand-500'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardBody>
          {tabLoading ? (
            <p className="text-sm text-gray-500">로딩 중...</p>
          ) : (
            <>
              {activeTab === 'invitations' && (
                <p className="text-sm text-gray-500 py-6">직원(스태프) 계정은 초대 이력이 없습니다.</p>
              )}
              {activeTab === 'commissions' && (
                <p className="text-sm text-gray-500 py-6">직원(스태프) 계정은 수수료 내역이 없습니다.</p>
              )}
              {activeTab === 'payments' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">파트너</th>
                        <th className="text-left py-2 px-2 font-medium">금액</th>
                        <th className="text-left py-2 px-2 font-medium">상태</th>
                        <th className="text-left py-2 px-2 font-medium">요청일</th>
                        <th className="text-left py-2 px-2 font-medium">완료일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payments.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-gray-500">결제 요청 내역이 없습니다.</td></tr>
                      ) : (
                        payments.map((r) => {
                          const partner = Array.isArray(r.partner) ? r.partner?.[0] : r.partner;
                          return (
                            <tr key={r.id} className="border-b">
                              <td className="py-2 px-2">{partner?.business_name ?? '-'}</td>
                              <td className="py-2 px-2 font-medium">{formatCurrency(r.amount)}</td>
                              <td className="py-2 px-2">{r.status === 'completed' ? '완료' : '요청'}</td>
                              <td className="py-2 px-2">{formatDate(r.created_at)}</td>
                              <td className="py-2 px-2">{r.completed_at ? formatDate(r.completed_at) : '-'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {activeTab === 'activity' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">액션</th>
                        <th className="text-left py-2 px-2 font-medium">리소스</th>
                        <th className="text-left py-2 px-2 font-medium">일시</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.length === 0 ? (
                        <tr><td colSpan={3} className="py-6 text-center text-gray-500">활동 로그가 없습니다.</td></tr>
                      ) : (
                        auditLogs.map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="py-2 px-2">{r.action}</td>
                            <td className="py-2 px-2">{r.resource_type ? `${r.resource_type}${r.resource_id ? ` #${r.resource_id.slice(0, 8)}` : ''}` : '-'}</td>
                            <td className="py-2 px-2">{formatDate(r.created_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
