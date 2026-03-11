'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { usePartnerDetail, usePartnerStatusUpdate } from '@/hooks/usePartners';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { formatCurrency, formatDate, formatBusinessNumber, formatPhone } from '@/utils/format';
import { getSupabase } from '@/lib/supabase';
import { ArrowLeft, Users, Wallet, Percent, Home, Activity } from 'lucide-react';

const TIER_LABELS: Record<string, string> = {
  bronze: '브론즈',
  silver: '실버',
  gold: '골드',
  platinum: '플래티넘',
  diamond: '다이아몬드',
};

type PartnerTab = 'customers' | 'settlements' | 'commissions' | 'properties' | 'activity';

interface CustomerRow {
  id: string;
  name: string;
  phone: string;
  category: string;
  status: string;
  created_at: string;
}

interface SettlementRow {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  completed_at: string | null;
}

interface ReceivableRow {
  id: string;
  amount: number;
  receivable_month: string;
  is_paid: boolean;
  created_at: string;
}

interface AssignmentRow {
  id: string;
  status: string;
  created_at: string;
  service_request?: { category: string; hq_status: string; customer?: { name: string; phone: string } | { name: string; phone: string }[] };
}

interface AuditRow {
  id: string;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  created_at: string;
}

const TAB_CONFIG: { key: PartnerTab; label: string; icon: React.ElementType }[] = [
  { key: 'customers', label: '고객목록', icon: Users },
  { key: 'settlements', label: '정산내역', icon: Wallet },
  { key: 'commissions', label: '수수료내역', icon: Percent },
  { key: 'properties', label: '매물', icon: Home },
  { key: 'activity', label: '활동로그', icon: Activity },
];

const STATUS_LABELS: Record<string, string> = {
  unread: '미열람',
  read: '열람',
  consulting: '상담예정',
  cancelled: '취소',
  reserved: '예약완료',
  completed: '전체완료',
  pending: '보류',
};

const CATEGORY_LABELS: Record<string, string> = {
  moving: '이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  kiosk: '키오스크',
};

export default function AdminPartnerDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : null;
  const { data: partner, isLoading } = usePartnerDetail(id);
  const statusUpdate = usePartnerStatusUpdate();

  const handleStatusChange = (status: 'active' | 'suspended' | 'terminated') => {
    if (!id) return;
    const labels = { active: '활성화', suspended: '정지', terminated: '해지' };
    if (status !== 'active' && !confirm(`이 파트너를 '${labels[status]}' 상태로 변경하시겠습니까?`)) return;
    statusUpdate.mutate({ id, status });
  };

  const [activeTab, setActiveTab] = useState<PartnerTab>('customers');
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [receivables, setReceivables] = useState<ReceivableRow[]>([]);
  const [assignments, setAssignments] = useState<AssignmentRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditRow[]>([]);
  const [tabLoading, setTabLoading] = useState(false);

  const fetchTabData = useCallback(async (partnerId: string, tab: PartnerTab) => {
    setTabLoading(true);
    try {
      const supabase = getSupabase();
      switch (tab) {
        case 'customers': {
          const { data } = await supabase
            .from('partner_assignments')
            .select(`
              id, status, created_at,
              service_request:service_requests!partner_assignments_service_request_id_fkey (
                category, hq_status,
                customer:customers!service_requests_customer_id_fkey (name, phone)
              )
            `)
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: false })
            .limit(50);
          const rows = (data ?? []).map((r: Record<string, unknown>) => {
            const sr = r.service_request as { category?: string; customer?: { name?: string; phone?: string } | { name?: string; phone?: string }[] } | undefined;
            const cust = Array.isArray(sr?.customer) ? sr?.customer?.[0] : sr?.customer;
            return {
              id: String(r.id ?? ''),
              name: cust?.name ?? '-',
              phone: cust?.phone ?? '-',
              category: CATEGORY_LABELS[String(sr?.category ?? '')] ?? String(sr?.category ?? '-'),
              status: STATUS_LABELS[String(r.status ?? '')] ?? String(r.status ?? '-'),
              created_at: String(r.created_at ?? ''),
            };
          });
          setCustomers(rows);
          break;
        }
        case 'settlements': {
          const { data } = await supabase
            .from('partner_payment_requests')
            .select('id, amount, status, created_at, completed_at')
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: false })
            .limit(50);
          setSettlements((data ?? []) as SettlementRow[]);
          break;
        }
        case 'commissions': {
          const { data } = await supabase
            .from('partner_receivables')
            .select('id, amount, receivable_month, is_paid, created_at')
            .eq('partner_id', partnerId)
            .order('receivable_month', { ascending: false })
            .limit(50);
          setReceivables((data ?? []) as ReceivableRow[]);
          break;
        }
        case 'properties': {
          const { data } = await supabase
            .from('partner_assignments')
            .select(`
              id, status, created_at,
              service_request:service_requests!partner_assignments_service_request_id_fkey (
                category, hq_status,
                customer:customers!service_requests_customer_id_fkey (name, phone)
              )
            `)
            .eq('partner_id', partnerId)
            .order('created_at', { ascending: false })
            .limit(50);
          setAssignments((data ?? []) as unknown as AssignmentRow[]);
          break;
        }
        case 'activity': {
          const { data: partnerRow } = await supabase
            .from('partners')
            .select('user_id')
            .eq('id', partnerId)
            .single();
          const userId = partnerRow?.user_id;
          if (userId) {
            const { data } = await supabase
              .from('audit_logs')
              .select('id, action, resource_type, resource_id, created_at')
              .eq('actor_type', 'partner')
              .eq('actor_id', userId)
              .order('created_at', { ascending: false })
              .limit(30);
            setAuditLogs((data ?? []) as AuditRow[]);
          } else {
            setAuditLogs([]);
          }
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

  if (isLoading || !partner) {
    return (
      <div className="space-y-6">
        <Link href="/admin/partners" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600">
          <ArrowLeft className="h-4 w-4" /> 파트너 관리
        </Link>
        <p className="text-gray-500">로딩 중이거나 파트너를 찾을 수 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Link href="/admin/partners" className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-brand-600">
            <ArrowLeft className="h-4 w-4" /> 파트너 관리 / {partner.companyName}
          </Link>
          <StatusBadge status={partner.status} type="partner" />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleStatusChange('active')}
            disabled={statusUpdate.isPending || partner.status === 'active'}
          >
            수정
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleStatusChange('suspended')}
            disabled={statusUpdate.isPending || partner.status === 'suspended'}
          >
            정지
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleStatusChange('terminated')}
            disabled={statusUpdate.isPending || partner.status === 'terminated'}
          >
            해지
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>기본 정보</CardHeader>
          <CardBody className="space-y-2 text-sm">
            <p><span className="text-gray-500">업체명</span> {partner.companyName}</p>
            <p><span className="text-gray-500">대표자</span> {partner.representativeName}</p>
            <p><span className="text-gray-500">사업자번호</span> {formatBusinessNumber(partner.businessNumber)}</p>
            <p><span className="text-gray-500">중개사번호</span> {partner.licenseNumber}</p>
            <p><span className="text-gray-500">주소</span> {partner.address}</p>
            <p><span className="text-gray-500">전화</span> {formatPhone(partner.phone)}</p>
            <p><span className="text-gray-500">등급</span> {TIER_LABELS[partner.tier] ?? partner.tier}</p>
            <p><span className="text-gray-500">인증일</span> {partner.verifiedAt ? formatDate(partner.verifiedAt) : '-'}</p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>정산 정보</CardHeader>
          <CardBody className="space-y-2 text-sm">
            <p><span className="text-gray-500">은행</span> {partner.bankInfo?.bankName ?? '-'}</p>
            <p><span className="text-gray-500">계좌</span> {partner.bankInfo?.accountNumber ?? '-'}</p>
            <p><span className="text-gray-500">예금주</span> {partner.bankInfo?.accountHolder ?? '-'}</p>
            <p><span className="text-gray-500">총 정산액</span> {formatCurrency(partner.totalSettlement)}</p>
            <p><span className="text-gray-500">미정산</span> {formatCurrency(partner.pendingSettlement)}</p>
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
              {activeTab === 'customers' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">고객명</th>
                        <th className="text-left py-2 px-2 font-medium">연락처</th>
                        <th className="text-left py-2 px-2 font-medium">서비스</th>
                        <th className="text-left py-2 px-2 font-medium">상태</th>
                        <th className="text-left py-2 px-2 font-medium">배정일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customers.length === 0 ? (
                        <tr><td colSpan={5} className="py-6 text-center text-gray-500">배정된 고객이 없습니다.</td></tr>
                      ) : (
                        customers.map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="py-2 px-2">{r.name}</td>
                            <td className="py-2 px-2">{formatPhone(r.phone)}</td>
                            <td className="py-2 px-2">{r.category}</td>
                            <td className="py-2 px-2">{r.status}</td>
                            <td className="py-2 px-2">{formatDate(r.created_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {activeTab === 'settlements' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">금액</th>
                        <th className="text-left py-2 px-2 font-medium">상태</th>
                        <th className="text-left py-2 px-2 font-medium">요청일</th>
                        <th className="text-left py-2 px-2 font-medium">완료일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {settlements.length === 0 ? (
                        <tr><td colSpan={4} className="py-6 text-center text-gray-500">정산 내역이 없습니다.</td></tr>
                      ) : (
                        settlements.map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="py-2 px-2 font-medium">{formatCurrency(r.amount)}</td>
                            <td className="py-2 px-2">{r.status === 'completed' ? '완료' : '요청'}</td>
                            <td className="py-2 px-2">{formatDate(r.created_at)}</td>
                            <td className="py-2 px-2">{r.completed_at ? formatDate(r.completed_at) : '-'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {activeTab === 'commissions' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">금액</th>
                        <th className="text-left py-2 px-2 font-medium">발생월</th>
                        <th className="text-left py-2 px-2 font-medium">정산여부</th>
                        <th className="text-left py-2 px-2 font-medium">생성일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receivables.length === 0 ? (
                        <tr><td colSpan={4} className="py-6 text-center text-gray-500">수수료 내역이 없습니다.</td></tr>
                      ) : (
                        receivables.map((r) => (
                          <tr key={r.id} className="border-b">
                            <td className="py-2 px-2 font-medium">{formatCurrency(r.amount)}</td>
                            <td className="py-2 px-2">{r.receivable_month ? r.receivable_month.slice(0, 7) : '-'}</td>
                            <td className="py-2 px-2">{r.is_paid ? '정산완료' : '미정산'}</td>
                            <td className="py-2 px-2">{formatDate(r.created_at)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {activeTab === 'properties' && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 px-2 font-medium">고객</th>
                        <th className="text-left py-2 px-2 font-medium">서비스</th>
                        <th className="text-left py-2 px-2 font-medium">상태</th>
                        <th className="text-left py-2 px-2 font-medium">배정일</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignments.length === 0 ? (
                        <tr><td colSpan={4} className="py-6 text-center text-gray-500">배정된 매물이 없습니다.</td></tr>
                      ) : (
                        assignments.map((r) => {
                          const sr = r.service_request;
                          const cust = Array.isArray(sr?.customer) ? sr?.customer?.[0] : sr?.customer;
                          return (
                            <tr key={r.id} className="border-b">
                              <td className="py-2 px-2">{cust?.name ?? '-'}</td>
                              <td className="py-2 px-2">{CATEGORY_LABELS[sr?.category ?? ''] ?? sr?.category ?? '-'}</td>
                              <td className="py-2 px-2">{STATUS_LABELS[r.status ?? ''] ?? r.status ?? '-'}</td>
                              <td className="py-2 px-2">{formatDate(r.created_at)}</td>
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
