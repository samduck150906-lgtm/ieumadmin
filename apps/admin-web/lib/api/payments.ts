import { getSupabase, getSupabaseOrServer } from '../supabase';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import { PartnerPaymentRequest, PaymentStatus } from '@/types/database';

// 결제 요청 목록 조회
export async function getPaymentRequests(params?: {
  search?: string;
  status?: PaymentStatus;
  page?: number;
  limit?: number;
}) {
  const supabase = getSupabase();
  const { search, status, page = 1, limit = 20 } = params || {};

  let query = supabase
    .from('partner_payment_requests')
    .select(`
      *,
      partner:partners!partner_payment_requests_partner_id_fkey (
        id, business_name, manager_name, manager_phone
      ),
      requested_by_user:users!partner_payment_requests_requested_by_fkey (
        name
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  // 상태 필터
  if (status) {
    query = query.eq('status', status);
  }

  // 페이지네이션
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) throw error;

  // 검색 필터 (클라이언트측)
  let filteredData = data || [];
  if (search) {
    const sanitized = sanitizeSearchQuery(search);
    if (sanitized) {
      filteredData = filteredData.filter((p: any) =>
        p.partner?.business_name?.includes(sanitized) ||
        p.memo?.includes(sanitized)
      );
    }
  }

  return {
    data: filteredData,
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

// 결제 요청 생성
export async function createPaymentRequest(
  partnerId: string,
  amount: number,
  memo: string,
  requestedBy: string,
  paymentMethod: 'card' | 'transfer' = 'transfer'
) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('partner_payment_requests')
    .insert({
      partner_id: partnerId,
      amount,
      memo,
      status: 'requested',
      requested_by: requestedBy,
      payment_method: paymentMethod,
    })
    .select()
    .single();

  if (error) throw error;

  return data;
}

// 결제 완료 처리
export async function completePaymentRequest(id: string) {
  const supabase = getSupabase();
  const now = new Date().toISOString();

  const { error } = await supabase
    .from('partner_payment_requests')
    .update({
      status: 'completed',
      completed_at: now,
      updated_at: now,
    })
    .eq('id', id);

  if (error) throw error;

  // 연결된 미수 is_paid = true 처리 (DB 트리거 보조 처리)
  const { data: links } = await supabase
    .from('partner_payment_receivables')
    .select('receivable_id')
    .eq('payment_request_id', id);

  if (links && links.length > 0) {
    const receivableIds = links.map((l: { receivable_id: string }) => l.receivable_id);
    await supabase
      .from('partner_receivables')
      .update({ is_paid: true, paid_at: now, updated_at: now })
      .in('id', receivableIds)
      .eq('is_paid', false);
  }
}

// 결제 요청 삭제
export async function deletePaymentRequest(id: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('partner_payment_requests')
    .delete()
    .eq('id', id)
    .eq('status', 'requested'); // 요청 상태인 것만 삭제 가능

  if (error) throw error;
}

/** 결제 요청 일괄 완료 */
export async function completePaymentRequestsBulk(ids: string[]) {
  const supabase = getSupabase();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('partner_payment_requests')
    .update({ status: 'completed', completed_at: now, updated_at: now })
    .in('id', ids)
    .eq('status', 'requested');
  if (error) throw error;
  for (const id of ids) {
    const { data: links } = await supabase
      .from('partner_payment_receivables')
      .select('receivable_id')
      .eq('payment_request_id', id);
    if (links?.length) {
      const receivableIds = links.map((l: { receivable_id: string }) => l.receivable_id);
      await supabase
        .from('partner_receivables')
        .update({ is_paid: true, paid_at: now, updated_at: now })
        .in('id', receivableIds)
        .eq('is_paid', false);
    }
  }
}

/** 결제 요청 일괄 삭제 (요청 상태만) */
export async function deletePaymentRequestsBulk(ids: string[]) {
  if (ids.length === 0) return;
  const supabase = getSupabase();
  const { error } = await supabase
    .from('partner_payment_requests')
    .delete()
    .in('id', ids)
    .eq('status', 'requested');
  if (error) throw error;
}

// 결제 통계
export async function getPaymentStats() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('partner_payment_requests')
    .select('status, amount, created_at');

  if (error) throw error;

  const requested = data?.filter((p: any) => p.status === 'requested') || [];
  const completed = data?.filter((p: any) => p.status === 'completed') || [];

  const requestedAmount = requested.reduce((sum, p) => sum + p.amount, 0);
  const completedAmount = completed.reduce((sum, p) => sum + p.amount, 0);

  // 이번 달 통계
  const now = new Date();
  const thisMonth = data?.filter((p: any) => {
    const created = new Date(p.created_at);
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }) || [];
  const thisMonthAmount = thisMonth.reduce((sum, p) => sum + p.amount, 0);

  return {
    requestedCount: requested.length,
    requestedAmount,
    completedCount: completed.length,
    completedAmount,
    thisMonthCount: thisMonth.length,
    thisMonthAmount,
    totalAmount: requestedAmount + completedAmount,
  };
}

// 미수 통계 반환 타입 (정산관리 메인: 총 미수·미수 업체 수·전월/당월 미수)
export type ReceivableStats = {
  totalAmount: number;
  totalCount: number;
  partnerCount: number;
  lastMonthAmount: number;
  lastMonthCount: number;
  thisMonthAmount: number;
  thisMonthCount: number;
};

// 미수 총액·건수·전월/당월·미수 업체 수 (본사 정산/결제 화면용)
export async function getReceivableStats(): Promise<ReceivableStats> {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('partner_receivables')
    .select('id, amount, receivable_month, partner_id')
    .eq('is_paid', false);
  if (error) throw error;
  const list = data || [];

  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = now.getMonth();
  const thisMonthStart = `${thisYear}-${String(thisMonth + 1).padStart(2, '0')}-01`;
  const lastMonthStart = new Date(thisYear, thisMonth - 1, 1);
  const lastMonthEnd = new Date(thisYear, thisMonth, 0);
  const lastMonthStartStr = lastMonthStart.toISOString().slice(0, 10);
  const lastMonthEndStr = lastMonthEnd.toISOString().slice(0, 10);
  const thisMonthEnd = new Date(thisYear, thisMonth + 1, 0);
  const thisMonthEndStr = thisMonthEnd.toISOString().slice(0, 10);

  let totalAmount = 0;
  const partnerIds = new Set<string>();
  let lastMonthAmount = 0;
  let lastMonthCount = 0;
  let thisMonthAmount = 0;
  let thisMonthCount = 0;

  const lastMonthYYYYMM = lastMonthStartStr.slice(0, 7);
  const thisMonthYYYYMM = thisMonthStart.slice(0, 7);
  for (const r of list) {
    const amt = Number(r.amount ?? 0);
    totalAmount += amt;
    if (r.partner_id) partnerIds.add(String(r.partner_id));
    const raw = (r.receivable_month && String(r.receivable_month)) || '';
    const yyyyMm = raw.slice(0, 7);
    if (yyyyMm === lastMonthYYYYMM) {
      lastMonthAmount += amt;
      lastMonthCount += 1;
    }
    if (yyyyMm === thisMonthYYYYMM) {
      thisMonthAmount += amt;
      thisMonthCount += 1;
    }
  }

  return {
    totalAmount,
    totalCount: list.length,
    partnerCount: partnerIds.size,
    lastMonthAmount,
    lastMonthCount,
    thisMonthAmount,
    thisMonthCount,
  };
}

/** 업체별 미수금 집계: 누가 얼마를 내야 하는지 (미결제만) */
export type ReceivablesByPartnerRow = {
  partner_id: string;
  business_name: string;
  unpaid_amount: number;
  unpaid_count: number;
};

export async function getReceivablesByPartner(): Promise<ReceivablesByPartnerRow[]> {
  const supabase = getSupabaseOrServer();
  const { data: rows, error } = await supabase
    .from('partner_receivables')
    .select('partner_id, amount')
    .eq('is_paid', false);
  if (error) throw error;
  const list = rows || [];
  if (list.length === 0) return [];

  const byPartner = new Map<string, { amount: number; count: number }>();
  for (const r of list) {
    const pid = String(r.partner_id ?? '');
    const amt = Number(r.amount ?? 0);
    const cur = byPartner.get(pid) ?? { amount: 0, count: 0 };
    byPartner.set(pid, { amount: cur.amount + amt, count: cur.count + 1 });
  }

  const partnerIds = Array.from(byPartner.keys());
  const { data: partners } = await supabase
    .from('partners')
    .select('id, business_name')
    .in('id', partnerIds);
  const partnerMap = new Map(
    (partners || []).map((p: { id: string; business_name?: string }) => [p.id, p])
  );

  return Array.from(byPartner.entries())
    .map(([partnerId, agg]) => ({
      partner_id: partnerId,
      business_name: (partnerMap.get(partnerId)?.business_name ?? '-') || '-',
      unpaid_amount: agg.amount,
      unpaid_count: agg.count,
    }))
    .sort((a, b) => b.unpaid_amount - a.unpaid_amount);
}

// 업체별 미수 목록 (본사: 미수 선택 청구용, API 라우트에서 호출 가능)
// withConsultation: true 시 고객명·상담유형 등 상담 정보 포함 (미수금 상담 리스트용)
export async function getReceivablesList(params?: {
  partnerId?: string;
  isPaid?: boolean;
  withConsultation?: boolean;
}) {
  const supabase = getSupabaseOrServer();
  let query = supabase
    .from('partner_receivables')
    .select(
      'id, amount, service_request_id, assignment_id, receivable_month, partner_id, is_paid, paid_at, payment_request_id, note, created_at'
    )
    .order('receivable_month', { ascending: false });
  if (params?.partnerId) {
    query = query.eq('partner_id', params.partnerId);
  }
  // isPaid가 명시된 경우에만 필터 적용 (기본: 전체 반환)
  if (params?.isPaid !== undefined) {
    query = query.eq('is_paid', params.isPaid);
  }
  const { data: rows, error } = await query;
  if (error) throw error;
  const list = rows || [];
  if (list.length === 0) return list;
  const partnerIds = Array.from(new Set(list.map((r: { partner_id: string }) => r.partner_id)));
  const { data: partners } = await supabase
    .from('partners')
    .select('id, business_name')
    .in('id', partnerIds);
  const partnerMap = new Map(
    (partners || []).map((p: { id: string; business_name?: string }) => [p.id, p])
  );

  let consultationMap: Map<string, { customer_name: string; category: string }> = new Map();
  if (params?.withConsultation) {
    const srIds = Array.from(
      new Set(
        list
          .map((r: { service_request_id?: string }) => r.service_request_id)
          .filter(Boolean) as string[]
      )
    );
    if (srIds.length > 0) {
      const { data: srRows } = await supabase
        .from('service_requests')
        .select('id, category, customer:customers!service_requests_customer_id_fkey(name)')
        .in('id', srIds);
      for (const sr of srRows || []) {
        const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
        const name = (customer as { name?: string })?.name ?? '-';
        consultationMap.set(sr.id, {
          customer_name: name,
          category: (sr.category as string) ?? '-',
        });
      }
    }
  }

  return list.map((r: { partner_id: string; service_request_id?: string; [k: string]: unknown }) => {
    const base = { ...r, partner: partnerMap.get(r.partner_id) ?? null };
    if (params?.withConsultation && r.service_request_id) {
      const c = consultationMap.get(r.service_request_id);
      return { ...base, customer_name: c?.customer_name ?? '-', category: c?.category ?? '-' };
    }
    return base;
  });
}

// 미수 선택 → 결제요청 생성 (업체별로 RPC 호출, API 라우트에서 호출 가능)
export async function createPaymentRequestFromReceivables(
  receivableIds: string[],
  requestedBy: string,
  paymentMethod: 'card' | 'transfer' = 'transfer'
): Promise<{ created: number; paymentRequestIds: string[] }> {
  const supabase = getSupabaseOrServer();
  if (receivableIds.length === 0) return { created: 0, paymentRequestIds: [] };

  const { data: rows } = await supabase
    .from('partner_receivables')
    .select('id, partner_id')
    .eq('is_paid', false)
    .in('id', receivableIds);
  if (!rows?.length) return { created: 0, paymentRequestIds: [] };

  const byPartner = new Map<string, string[]>();
  for (const r of rows) {
    const pid = r.partner_id as string;
    if (!byPartner.has(pid)) byPartner.set(pid, []);
    byPartner.get(pid)!.push(r.id);
  }

  const paymentRequestIds: string[] = [];
  for (const [_partnerId, ids] of Array.from(byPartner.entries())) {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('rpc_create_payment_request', {
      p_receivable_ids: ids,
      p_method: paymentMethod,
      p_requested_by: requestedBy,
    });
    if (rpcError) throw rpcError;
    const result = rpcResult as { success?: boolean; payment_request_id?: string };
    if (result?.success && result?.payment_request_id) {
      paymentRequestIds.push(result.payment_request_id);
    }
  }
  return { created: paymentRequestIds.length, paymentRequestIds };
}
