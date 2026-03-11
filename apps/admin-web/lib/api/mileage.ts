import { getSupabase } from '../supabase';
import { getSiteSettings } from './settings';

// ── Types ──────────────────────────────────────────────

export interface MileageBalance {
  balance: number;
  totalEarned: number;
  totalUsed: number;
}

export interface MileageLog {
  id: string;
  partner_id: string;
  amount: number;
  type: string;
  reference_id: string | null;
  note: string | null;
  balance_after: number;
  created_at: string;
}

export interface MileageLogsResult {
  data: MileageLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface MileageEarnResult {
  success: boolean;
  reason?: string;
  mileageEarned?: number;
  balanceAfter?: number;
}

export interface MileageSpendResult {
  success: boolean;
  reason?: string;
  amountUsed?: number;
  balanceAfter?: number;
  balance?: number;
}

// ── Functions ──────────────────────────────────────────

/** 마일리지 잔액 조회 */
export async function getMileageBalance(partnerId: string): Promise<MileageBalance> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('partner_mileage_balance')
    .select('balance, total_earned, total_used')
    .eq('partner_id', partnerId)
    .maybeSingle();

  if (error) throw error;

  return {
    balance: data?.balance ?? 0,
    totalEarned: data?.total_earned ?? 0,
    totalUsed: data?.total_used ?? 0,
  };
}

/** 마일리지 이력 조회 (페이지네이션) */
export async function getMileageLogs(
  partnerId: string,
  params?: { page?: number; limit?: number }
): Promise<MileageLogsResult> {
  const { page = 1, limit = 20 } = params || {};
  const supabase = getSupabase();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabase
    .from('partner_mileage_history')
    .select('id, partner_id, amount, type, reference_id, note, balance_after, created_at', { count: 'exact' })
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const total = count ?? 0;
  return {
    data: (data ?? []) as MileageLog[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * 마일리지 적립 (결제 완료 시 호출)
 * site_settings의 tier 설정을 기반으로 DB RPC 호출
 */
export async function earnMileage(
  partnerId: string,
  paymentAmount: number,
  referenceId?: string
): Promise<MileageEarnResult> {
  const supabase = getSupabase();

  // site_settings에서 마일리지 요율 확인 (참고용 로그)
  const settings = await getSiteSettings();
  const tier1 = settings?.mileage_tier1_threshold ?? 2000000;
  const tier2 = settings?.mileage_tier2_threshold ?? 5000000;

  if (paymentAmount < tier1) {
    return { success: false, reason: 'below_threshold' };
  }

  const { data, error } = await supabase.rpc('add_partner_mileage', {
    p_partner_id: partnerId,
    p_payment_amount: paymentAmount,
    p_reference_id: referenceId ?? null,
    p_note: paymentAmount >= tier2
      ? `결제금액 ${paymentAmount.toLocaleString()}원 (5% 적립)`
      : `결제금액 ${paymentAmount.toLocaleString()}원 (3% 적립)`,
  });

  if (error) throw error;

  const result = data as { success: boolean; reason?: string; mileage_earned?: number; balance_after?: number };

  return {
    success: result.success,
    reason: result.reason,
    mileageEarned: result.mileage_earned,
    balanceAfter: result.balance_after,
  };
}

/**
 * 마일리지 차감 (DB 구매, 미수금 결제 시)
 */
export async function spendMileage(
  partnerId: string,
  amount: number,
  reason: string,
  referenceId?: string
): Promise<MileageSpendResult> {
  if (amount <= 0) {
    return { success: false, reason: 'invalid_amount' };
  }

  const supabase = getSupabase();

  // type 매핑: reason에 따라 DB 저장 타입 결정
  let spendType = 'used_payment';
  if (reason.includes('DB 구매') || reason.includes('db_purchase')) {
    spendType = 'used_db_purchase';
  }

  const { data, error } = await supabase.rpc('use_partner_mileage', {
    p_partner_id: partnerId,
    p_amount: amount,
    p_type: spendType,
    p_reference_id: referenceId ?? null,
    p_note: reason,
  });

  if (error) throw error;

  const result = data as { success: boolean; reason?: string; amount_used?: number; balance_after?: number; balance?: number };

  return {
    success: result.success,
    reason: result.reason,
    amountUsed: result.amount_used,
    balanceAfter: result.balance_after,
    balance: result.balance,
  };
}
