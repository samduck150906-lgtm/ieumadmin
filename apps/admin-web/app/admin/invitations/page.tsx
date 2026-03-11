'use client';

import { useState, useEffect, useCallback } from 'react';
import { Send, Search, RefreshCw, User, Phone, Calendar, CheckCircle, Clock, XCircle } from 'lucide-react';
import { Card, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import SearchInput from '@/components/ui/SearchInput';
import { getSupabase } from '@/lib/supabase';

interface Invitation {
  id: string;
  partner_id: string;
  invitee_phone: string;
  invitee_name: string | null;
  invite_code: string;
  status: 'sent' | 'registered' | 'expired';
  accepted_at: string | null;
  expires_at: string;
  sms_sent_at: string | null;
  created_at: string;
  partner?: { business_name: string };
}

const STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  sent: { label: '발송됨', color: 'bg-blue-100 text-blue-700', icon: Clock },
  registered: { label: '가입완료', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  expired: { label: '만료', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

const STATUS_FILTERS = [
  { value: '', label: '전체' },
  { value: 'sent', label: '발송됨' },
  { value: 'registered', label: '가입완료' },
  { value: 'expired', label: '만료' },
];

export default function AdminInvitationsPage() {
  const [items, setItems] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const LIMIT = 20;

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = getSupabase();
      let query = supabase
        .from('partner_invitations')
        .select('*, partner:partners!partner_invitations_partner_id_fkey(business_name)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * LIMIT, page * LIMIT - 1);

      if (statusFilter) query = query.eq('status', statusFilter);
      if (search) query = query.or(`invitee_name.ilike.%${search}%,invitee_phone.ilike.%${search}%`);

      const { data, count, error } = await query;
      if (error) throw error;
      setItems((data ?? []) as Invitation[]);
      setTotal(count ?? 0);
    } catch (e) {
      console.error('초대 목록 조회 오류', e);
      setLoadError(e instanceof Error ? e.message : '초대 목록을 불러오지 못했습니다. 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { loadData(); }, [loadData]);

  const totalPages = Math.ceil(total / LIMIT);

  const formatPhone = (phone: string) =>
    phone.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3');

  return (
    <div className="space-y-6">
      {loadError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-4">
          <span>{loadError}</span>
          <Button variant="secondary" size="sm" onClick={() => { setLoadError(null); loadData(); }}>
            재시도
          </Button>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">초대 관리</h1>
          <p className="text-sm text-gray-500 mt-1">제휴업체가 공인중개사에게 발송한 초대 이력</p>
        </div>
        <Button variant="secondary" onClick={loadData} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </Button>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { label: '전체', value: total, color: 'text-gray-900' },
          { label: '가입완료', value: items.filter((i) => i.status === 'registered').length, color: 'text-green-600' },
          { label: '대기중', value: items.filter((i) => i.status === 'sent').length, color: 'text-blue-600' },
        ].map((s) => (
          <Card key={s.label}>
            <CardBody className="text-center py-4">
              <p className={`text-2xl font-bold ${s.color}`}>{s.value.toLocaleString()}</p>
              <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <SearchInput
              value={search}
              onChange={(v) => { setSearch(v); setPage(1); }}
              placeholder="이름 / 전화번호 검색"
              className="max-w-xs"
            />
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => { setStatusFilter(f.value); setPage(1); }}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    statusFilter === f.value
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Send className="h-10 w-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">초대 내역이 없습니다.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['발송 업체', '초대 대상', '전화번호', '초대 코드', '상태', '발송일', '가입일'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {items.map((inv) => {
                    const s = STATUS_LABELS[inv.status] ?? STATUS_LABELS.expired;
                    const StatusIcon = s.icon;
                    const isExpired = !inv.accepted_at && new Date(inv.expires_at) < new Date();
                    return (
                      <tr key={inv.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {(inv.partner as { business_name?: string } | null)?.business_name ?? '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          <span className="flex items-center gap-1.5">
                            <User className="h-3.5 w-3.5 text-gray-400" />
                            {inv.invitee_name ?? '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <span className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-gray-400" />
                            {formatPhone(inv.invitee_phone)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-mono text-gray-500">{inv.invite_code}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${isExpired && inv.status === 'sent' ? STATUS_LABELS.expired.color : s.color}`}>
                            <StatusIcon className="h-3 w-3" />
                            {isExpired && inv.status === 'sent' ? '만료' : s.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3.5 w-3.5 text-gray-400" />
                            {inv.sms_sent_at ? new Date(inv.sms_sent_at).toLocaleDateString('ko-KR') : '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {inv.accepted_at ? new Date(inv.accepted_at).toLocaleDateString('ko-KR') : '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-gray-500">총 {total}건</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>이전</Button>
                <span className="flex items-center px-3 text-sm text-gray-600">{page} / {totalPages}</span>
                <Button variant="secondary" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>다음</Button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
