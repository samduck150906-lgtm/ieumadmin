'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AlertCircle, FileText, Save } from 'lucide-react';
import AdminLayout from '@/components/AdminLayout';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { getSupabase } from '@/lib/supabase';
import { DbListContainer, DbListRow } from '@/components/DbList';
import BulkActionBar from '@/components/BulkActionBar';
import { showError, showSuccess } from '@/lib/toast';
import { getErrorMessage } from '@/lib/logger';

interface ComplaintItem {
  id: string;
  sourceType: 'low_rating' | 'complaint';
  type: 'low_rating' | 'complaint';
  customerName?: string;
  partnerName?: string;
  partnerId?: string | null;
  complaintCount?: number;
  content?: string;
  status: string;
  follow_up_memo?: string | null;
  follow_up_at?: string | null;
  follow_up_by?: string | null;
  follow_up_by_name?: string | null;
  created_at: string;
  service_request_id?: string;
}

function itemKey(item: ComplaintItem): string {
  return `${item.sourceType}-${item.id}`;
}

export default function ComplaintsPage() {
  const [items, setItems] = useState<ComplaintItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [followUpModal, setFollowUpModal] = useState<{
    item: ComplaintItem;
    follow_up_memo: string;
    status: 'pending' | 'resolved';
  } | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const supabase = getSupabase();
      const result: ComplaintItem[] = [];

    const { data: reviews } = await supabase
      .from('reviews')
      .select(`
        id, rating, comment, created_at, service_request_id,
        service_request:service_requests(id, customer:customers(name))
      `)
      .eq('rating', 'unsatisfied')
      .order('created_at', { ascending: false })
      .limit(50);

    const reqIds = (reviews || []).map((r: { service_request_id: string }) => r.service_request_id).filter(Boolean);
    let partnerMap: Record<string, string> = {};
    let partnerIdMap: Record<string, string> = {};
    let partnerCountMap: Record<string, number> = {};
    if (reqIds.length > 0) {
      const { data: srs } = await supabase
        .from('service_requests')
        .select('id, assigned_partner_id')
        .in('id', reqIds);
      const partnerIds = Array.from(new Set((srs || []).map((s: { assigned_partner_id?: string }) => s.assigned_partner_id).filter(Boolean) as string[]));
      const { data: partners } = partnerIds.length > 0
        ? await supabase.from('partners').select('id, business_name, complaint_count').in('id', partnerIds)
        : { data: [] };
      (srs || []).forEach((s: { id: string; assigned_partner_id?: string }) => {
        const p = (partners || []).find((x: { id: string }) => x.id === s.assigned_partner_id);
        if (p) {
          partnerMap[s.id] = (p as { business_name?: string }).business_name || '-';
          partnerIdMap[s.id] = p.id;
          partnerCountMap[p.id] = (p as { complaint_count?: number }).complaint_count ?? 0;
        }
      });
    }

    let lowRatingLogMap: Record<string, { status: string; follow_up_memo?: string | null; follow_up_at?: string | null; follow_up_by?: string | null }> = {};
    if (reqIds.length > 0) {
      const { data: lowLogs } = await supabase
        .from('complaint_logs')
        .select('service_request_id, status, follow_up_memo, follow_up_at, follow_up_by')
        .eq('type', 'low_rating')
        .in('service_request_id', reqIds);
      (lowLogs || []).forEach((row: { service_request_id: string; status?: string; follow_up_memo?: string | null; follow_up_at?: string | null; follow_up_by?: string | null }) => {
        lowRatingLogMap[row.service_request_id] = {
          status: row.status || 'pending',
          follow_up_memo: row.follow_up_memo,
          follow_up_at: row.follow_up_at,
          follow_up_by: row.follow_up_by,
        };
      });
    }

    for (const r of reviews || []) {
      const sr = Array.isArray(r.service_request) ? r.service_request[0] : r.service_request;
      const cust = sr?.customer as { name?: string } | { name?: string }[] | undefined;
      const customer = Array.isArray(cust) ? cust[0] : cust;
      const pid = r.service_request_id ? partnerIdMap[r.service_request_id] : undefined;
      const logInfo = r.service_request_id ? lowRatingLogMap[r.service_request_id] : undefined;
      result.push({
        id: r.id,
        sourceType: 'low_rating',
        type: 'low_rating',
        customerName: customer?.name,
        partnerName: partnerMap[r.service_request_id] || '-',
        partnerId: pid || null,
        complaintCount: pid ? partnerCountMap[pid] : undefined,
        content: r.comment,
        status: logInfo?.status ?? 'pending',
        follow_up_memo: logInfo?.follow_up_memo,
        follow_up_at: logInfo?.follow_up_at,
        follow_up_by: logInfo?.follow_up_by ?? null,
        created_at: r.created_at,
        service_request_id: r.service_request_id,
      });
    }

    try {
      const { data: logs } = await supabase
        .from('complaint_logs')
        .select(`
          id, type, content, status, follow_up_memo, follow_up_at, follow_up_by, created_at, service_request_id, partner_id,
          partner:partners(business_name, complaint_count)
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      for (const l of logs || []) {
        const partner = Array.isArray(l.partner) ? l.partner[0] : l.partner;
        result.push({
          id: l.id,
          sourceType: 'complaint',
          type: (l.type as 'complaint') || 'complaint',
          customerName: undefined,
          partnerName: (partner as { business_name?: string })?.business_name ?? '-',
          partnerId: l.partner_id,
          complaintCount: (partner as { complaint_count?: number })?.complaint_count ?? 0,
          content: l.content,
          status: l.status || 'pending',
          follow_up_memo: l.follow_up_memo,
          follow_up_at: l.follow_up_at,
          follow_up_by: (l as { follow_up_by?: string | null }).follow_up_by ?? null,
          created_at: l.created_at,
          service_request_id: l.service_request_id,
        });
      }
    } catch (e) {
      console.warn('[complaints] follow_up 조회 실패 (테이블 미존재 가능):', e);
    }

    const followUpByIds = Array.from(new Set(result.map((i) => i.follow_up_by).filter(Boolean) as string[]));
    let followUpByNameMap: Record<string, string> = {};
    if (followUpByIds.length > 0) {
      const { data: users } = await supabase.from('users').select('id, name').in('id', followUpByIds);
      (users || []).forEach((u: { id: string; name?: string | null }) => {
        followUpByNameMap[u.id] = u.name?.trim() || '(이름 없음)';
      });
    }
    result.forEach((i) => {
      i.follow_up_by_name = i.follow_up_by ? followUpByNameMap[i.follow_up_by] ?? i.follow_up_by : null;
    });

    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    setItems(result.slice(0, 50));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : '데이터를 불러오지 못했습니다. 다시 시도해 주세요.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onRefresh = useCallback(() => loadData(), [loadData]);

  const openFollowUp = (item: ComplaintItem) => {
    setFollowUpModal({
      item,
      follow_up_memo: item.follow_up_memo ?? '',
      status: (item.status === 'resolved' ? 'resolved' : 'pending') as 'pending' | 'resolved',
    });
  };

  const saveFollowUp = async () => {
    if (!followUpModal || !followUpModal.follow_up_memo.trim()) {
      showError('후속조치 내용을 입력해 주세요.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/complaints/follow-up', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceType: followUpModal.item.sourceType,
          id: followUpModal.item.id,
          service_request_id: followUpModal.item.service_request_id,
          follow_up_memo: followUpModal.follow_up_memo.trim(),
          status: followUpModal.status,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || '저장 실패');
        return;
      }
      showSuccess('후속조치가 기록되었습니다. 업체 불만 횟수가 반영되었을 수 있습니다.');
      setFollowUpModal(null);
      loadData();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const allIds = items.map(itemKey);

  const handleBulkStatusChange = async (status: 'pending' | 'resolved') => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    const payloadItems = ids.map((key) => {
      const item = items.find((i) => itemKey(i) === key);
      if (!item) return null;
      return {
        sourceType: item.sourceType,
        id: item.id,
        ...(item.service_request_id ? { service_request_id: item.service_request_id } : {}),
      };
    }).filter(Boolean) as { sourceType: 'low_rating' | 'complaint'; id: string; service_request_id?: string }[];
    if (payloadItems.length === 0) return;
    const label = status === 'resolved' ? '처리완료' : '대기';
    if (!confirm(`선택한 ${payloadItems.length}건을 '${label}'으로 변경하시겠습니까?`)) return;
    setBulkUpdating(true);
    try {
      const res = await fetch('/api/complaints/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payloadItems, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || '일괄 상태변경 실패');
        return;
      }
      if (data.errors?.length) {
        showError(`${data.updated}건 완료, ${data.failed}건 실패: ${data.errors.slice(0, 3).join(', ')}`);
      } else {
        showSuccess(`${data.updated}건 상태 변경 완료`);
      }
      setSelectedIds(new Set());
      loadData();
    } catch (e) {
      showError(getErrorMessage(e));
    } finally {
      setBulkUpdating(false);
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {loadError && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-center justify-between gap-4">
            <span>{loadError}</span>
            <Button variant="secondary" size="sm" onClick={() => { setLoadError(null); loadData(); }}>
              재시도
            </Button>
          </div>
        )}
        <div>
        <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-bold text-gray-900 mb-1">고객 민원 관리</h1>
            <p className="text-sm text-gray-500 leading-relaxed">
              불만·저평점 건을 열람하고 후속조치를 기록하면 해당 업체 불만 횟수가 누적됩니다.
            </p>
          </div>
          <Link
            href="/customers"
            className="text-sm text-blue-600 hover:underline flex items-center gap-1 shrink-0 pt-0.5"
          >
            <FileText className="h-4 w-4" />
            고객 목록 보기
          </Link>
        </div>

        {items.length > 0 && (
          <BulkActionBar
            totalCount={items.length}
            selected={selectedIds}
            allIds={allIds}
            onSelectionChange={setSelectedIds}
            loading={bulkUpdating}
            actions={[
              { label: '일괄 처리완료', value: 'resolved', variant: 'success' },
              { label: '일괄 대기로', value: 'pending', variant: 'default' },
            ]}
            onAction={(value, _ids) => handleBulkStatusChange(value as 'pending' | 'resolved')}
          />
        )}

        <DbListContainer
          filterBar={
            <div className="flex gap-2 overflow-x-auto items-center min-h-[2.5rem]">
              <span className="text-sm text-gray-500 py-1">
                저평점·불만 유입 건을 확인하고 후속조치를 기록하세요.
              </span>
            </div>
          }
          onRefresh={onRefresh}
          refreshing={loading}
        >
          {loading ? (
            <div className="text-center py-12 text-gray-400">로딩 중...</div>
          ) : items.length === 0 ? (
            <Card className="text-center py-12">
              <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">민원/불만 건이 없습니다</p>
            </Card>
          ) : (
            <div className="space-y-3 pb-6">
              {items.map((item) => (
                <DbListRow
                  key={itemKey(item)}
                  quickActions={[
                    ...(item.service_request_id
                      ? [{ id: 'detail', label: '상담 상세보기', onClick: () => window.open(`/requests?highlight=${item.service_request_id}`, '_self') }]
                      : []),
                    { id: 'followup', label: '후속조치 기록', onClick: () => openFollowUp(item) },
                  ]}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(itemKey(item))}
                        onChange={() => {
                          const next = new Set(selectedIds);
                          if (next.has(itemKey(item))) next.delete(itemKey(item));
                          else next.add(itemKey(item));
                          setSelectedIds(next);
                        }}
                        className="mt-1 rounded border-gray-300 text-primary-600 shrink-0"
                        aria-label="선택"
                      />
                      <div className="min-w-0 flex-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.type === 'low_rating' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                        {item.type === 'low_rating' ? '저평점' : '불만'}
                      </span>
                      {item.customerName && <span className="ml-2 text-sm text-gray-600">{item.customerName}</span>}
                      {item.partnerName && (
                        <span className="ml-2 text-sm text-gray-500">
                          → {item.partnerName}
                          {item.complaintCount != null && item.complaintCount > 0 && (
                            <span className="text-gray-400"> (불만 {item.complaintCount}건)</span>
                          )}
                        </span>
                      )}
                      <p className="mt-2 text-sm text-gray-700">{item.content || '-'}</p>
                      {item.follow_up_memo && (
                        <p className="mt-1 text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                          후속조치: {item.follow_up_memo}
                        </p>
                      )}
                      {(item.follow_up_by_name != null && item.follow_up_by_name !== '') && (
                        <p className="mt-1 text-xs text-gray-600">
                          담당자: <span className="font-medium">{item.follow_up_by_name}</span>
                        </p>
                      )}
                      <p className="mt-1 text-xs text-gray-400">{new Date(item.created_at).toLocaleString('ko-KR')}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className={`text-xs px-2 py-1 rounded ${item.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {item.status === 'resolved' ? '처리완료' : '대기'}
                      </span>
                      <Button variant="secondary" size="sm" type="button" onClick={() => openFollowUp(item)}>
                        후속조치 기록
                      </Button>
                    </div>
                  </div>
                </DbListRow>
              ))}
            </div>
          )}
        </DbListContainer>
      </div>

      {followUpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 modal-bottom-sheet">
          <Card className="w-full max-w-md max-h-[90vh] overflow-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">후속조치 기록</h3>
            <p className="text-sm text-gray-500 mb-1">
              {followUpModal.item.partnerName}
              {followUpModal.item.complaintCount != null && followUpModal.item.complaintCount > 0 && ` (업체 불만 ${followUpModal.item.complaintCount}건)`}
            </p>
            {followUpModal.item.follow_up_by_name != null && followUpModal.item.follow_up_by_name !== '' && (
              <p className="text-sm text-gray-600 mb-2">
                담당자: <span className="font-medium">{followUpModal.item.follow_up_by_name}</span>
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">후속조치 내용 *</label>
                <textarea
                  className="input w-full min-h-[100px]"
                  value={followUpModal.follow_up_memo}
                  onChange={(e) => setFollowUpModal((m) => m ? { ...m, follow_up_memo: e.target.value } : null)}
                  placeholder="조치 내용을 입력하세요. 저장 시 해당 업체 불만 횟수가 1 누적됩니다."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">처리 상태</label>
                <select
                  className="input w-full"
                  value={followUpModal.status}
                  onChange={(e) => setFollowUpModal((m) => m ? { ...m, status: e.target.value as 'pending' | 'resolved' } : null)}
                >
                  <option value="pending">대기</option>
                  <option value="resolved">처리완료</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="secondary" type="button" onClick={() => setFollowUpModal(null)} disabled={saving}>
                취소
              </Button>
              <Button type="button" onClick={saveFollowUp} disabled={saving}>
                <Save className="h-4 w-4 mr-2" />
                {saving ? '저장 중…' : '저장'}
              </Button>
            </div>
          </Card>
        </div>
      )}
      </div>
    </AdminLayout>
  );
}
