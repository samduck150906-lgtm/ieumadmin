import { getSupabase } from '../supabase';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import { WithdrawalRequest, WithdrawalStatus, Commission } from '@/types/database';
import { trackBusinessEvent } from '@/lib/monitoring';

// 출금 신청 목록 조회
export async function getWithdrawalRequests(params?: {
  search?: string;
  status?: WithdrawalStatus;
  page?: number;
  limit?: number;
}) {
  const supabase = getSupabase();
  const { search, status, page = 1, limit = 20 } = params || {};

  // 검색 시 공인중개사 ID 먼저 조회 (DB 쿼리로 필터링). sanitize 후 비면 검색 없이 전체 조회
  let realtorIdFilter: string[] | undefined;
  if (search && search.trim()) {
    const sanitized = sanitizeSearchQuery(search);
    if (sanitized) {
      const term = `%${sanitized}%`;
      const [r1, r2] = await Promise.all([
        supabase.from('realtors').select('id').ilike('business_name', term),
        supabase.from('realtors').select('id').ilike('contact_name', term),
      ]);
      if (r1.error) throw r1.error;
      if (r2.error) throw r2.error;
      const ids = new Set([
        ...(r1.data ?? []).map((r: { id: string }) => r.id),
        ...(r2.data ?? []).map((r: { id: string }) => r.id),
      ]);
      realtorIdFilter = Array.from(ids);
      if (realtorIdFilter.length === 0) {
        return { data: [], total: 0, page, limit, totalPages: 0 };
      }
    }
  }

  let query = supabase
    .from('withdrawal_requests')
    .select(`
      *,
      realtor:realtors!withdrawal_requests_realtor_id_fkey (
        id, business_name, contact_name, contact_phone,
        account_verified, account_type,
        user:users!realtors_user_id_fkey (email)
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (realtorIdFilter?.length) {
    query = query.in('realtor_id', realtorIdFilter);
  }
  if (status) {
    query = query.eq('status', status);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

/** 무통장입금 개인 주문 내역 — account_type이 personal 또는 null인 공인중개사의 출금 신청 목록 (P.34) */
export async function getWithdrawalRequestsPersonal(params?: {
  page?: number;
  limit?: number;
  status?: WithdrawalStatus;
}) {
  const supabase = getSupabase();
  const { page = 1, limit = 20, status } = params ?? {};
  const { data: realtorRows, error: reErr } = await supabase
    .from('realtors')
    .select('id')
    .or('account_type.eq.personal,account_type.is.null');
  if (reErr) throw reErr;
  const personalRealtorIds = (realtorRows ?? []).map((r: { id: string }) => r.id);
  if (personalRealtorIds.length === 0) {
    return { data: [], total: 0, page, limit, totalPages: 0 };
  }

  let query = supabase
    .from('withdrawal_requests')
    .select(
      `
      *,
      realtor:realtors!withdrawal_requests_realtor_id_fkey (
        id, business_name, contact_name, contact_phone,
        account_type, account_verified
      )
    `,
      { count: 'exact' }
    )
    .in('realtor_id', personalRealtorIds)
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);
  const { data, error, count } = await query;
  if (error) throw error;

  return {
    data: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

// 출금 신청 상세 조회
export async function getWithdrawalById(id: string) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select(`
      *,
      realtor:realtors!withdrawal_requests_realtor_id_fkey (
        *,
        user:users!realtors_user_id_fkey (*)
      )
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// 출금 상태 변경 (승인)
export async function approveWithdrawal(id: string, processedBy: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'approved',
      processed_by: processedBy,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
  trackBusinessEvent('admin.settlements.approve', {
    withdrawalRequestId: id,
    processedBy,
  });
}

// 출금 상태 변경 (완료) — complete_withdrawal RPC 사용 (row lock + 단일 트랜잭션, 금융 정합성)
export async function completeWithdrawal(id: string, processedBy: string) {
  const supabase = getSupabase();
  const { data: result, error: rpcError } = await supabase.rpc('complete_withdrawal', {
    p_withdrawal_id: id,
    p_processed_by: processedBy,
  });

  if (rpcError) throw rpcError;

  const payload = result as { success?: boolean; error?: string } | null;
  if (!payload?.success) {
    throw new Error(payload?.error ?? '출금 완료 처리에 실패했습니다.');
  }

  trackBusinessEvent('admin.settlements.complete', {
    withdrawalRequestId: id,
    processedBy,
  });
}

// 출금 상태 변경 (반려)
export async function rejectWithdrawal(id: string, processedBy: string, reason: string) {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'rejected',
      processed_by: processedBy,
      processed_at: new Date().toISOString(),
      reject_reason: reason,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
  trackBusinessEvent('admin.settlements.reject', {
    withdrawalRequestId: id,
    processedBy,
    reason,
  });
}

// 일괄 승인
export async function bulkApproveWithdrawals(ids: string[], processedBy: string) {
  const supabase = getSupabase();
  const results = [];

  for (const id of ids) {
    try {
      await approveWithdrawal(id, processedBy);
      results.push({ id, success: true });
    } catch (error: any) {
      results.push({ id, success: false, error: error.message });
    }
  }

  return results;
}

// 일괄 완료
export async function bulkCompleteWithdrawals(ids: string[], processedBy: string) {
  const results = [];

  for (const id of ids) {
    try {
      await completeWithdrawal(id, processedBy);
      results.push({ id, success: true });
    } catch (error: any) {
      results.push({ id, success: false, error: error.message });
    }
  }

  return results;
}

// 출금 통계
export async function getWithdrawalStats() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('withdrawal_requests')
    .select('status, amount, created_at');

  if (error) throw error;

  const requested = data?.filter((w: any) => w.status === 'requested') || [];
  const approved = data?.filter((w: any) => w.status === 'approved') || [];
  const completed = data?.filter((w: any) => w.status === 'completed') || [];

  const requestedAmount = requested.reduce((sum, w) => sum + w.amount, 0);
  const approvedAmount = approved.reduce((sum, w) => sum + w.amount, 0);
  const completedAmount = completed.reduce((sum, w) => sum + w.amount, 0);

  return {
    requestedCount: requested.length,
    requestedAmount,
    approvedCount: approved.length,
    approvedAmount,
    completedCount: completed.length,
    completedAmount,
    totalAmount: requestedAmount + approvedAmount + completedAmount,
  };
}

/** 매월 20일부터 출금 신청 가능 */
export function canRequestWithdrawal(): { allowed: boolean; message?: string } {
  const now = new Date();
  if (now.getDate() < 20) {
    return {
      allowed: false,
      message: `출금 신청은 매월 20일부터 가능합니다. (이번 달 ${now.getMonth() + 1}월 20일부터)`,
    };
  }
  return { allowed: true };
}

/** 출금 신청 생성 — 20일 체크, 계좌인증 체크, 개인 3.3% 원천세 반영 */
export async function createWithdrawalRequest(
  realtorId: string,
  payload: { amount: number; bank_name: string; account_number: string; account_holder: string }
) {
  const supabase = getSupabase();
  const check = canRequestWithdrawal();
  if (!check.allowed) throw new Error(check.message);

  const { data: realtor } = await supabase
    .from('realtors')
    .select('id, account_verified, account_type, bank_name, account_number, account_holder')
    .eq('id', realtorId)
    .single();

  if (!realtor) throw new Error('공인중개사 정보를 찾을 수 없습니다.');
  if (!realtor.account_verified) {
    throw new Error('출금 신청을 하려면 계좌 인증(신분증·통장사본 등)을 먼저 완료해주세요.');
  }

  const { error } = await supabase.from('withdrawal_requests').insert({
    realtor_id: realtorId,
    amount: payload.amount,
    bank_name: payload.bank_name,
    account_number: payload.account_number,
    account_holder: payload.account_holder,
    status: 'requested',
  });

  if (error) throw error;

  trackBusinessEvent('admin.settlements.create_request', {
    realtorId,
    amount: payload.amount,
  });
}

// 수수료 내역 조회
export async function getCommissions(realtorId?: string) {
  const supabase = getSupabase();
  let query = supabase
    .from('commissions')
    .select(`
      *,
      realtor:realtors!commissions_realtor_id_fkey (
        id, business_name
      ),
      referred_realtor:realtors!commissions_referred_realtor_id_fkey (
        id, business_name
      ),
      service_request:service_requests (
        id, category,
        customer:customers (name)
      )
    `)
    .order('created_at', { ascending: false });

  if (realtorId) {
    query = query.eq('realtor_id', realtorId);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data;
}
