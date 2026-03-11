/**
 * 결제 확정 공통 로직 (mock-checkout, Toss confirm 공유)
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DbViewSessionPayload,
  PropertySessionPayload,
  WithdrawalSessionPayload,
} from './payment-session';

export type FinalizeError = { ok: false; message: string };
export type FinalizeSuccess = { ok: true; message: string };
export type FinalizeResult = FinalizeSuccess | FinalizeError;

export interface FinalizePropertyOptions {
  pgPaymentId?: string;
}

export async function finalizeDbView(
  supabase: SupabaseClient,
  payload: DbViewSessionPayload
): Promise<FinalizeResult> {
  const { data: requestRow } = await supabase
    .from('service_requests')
    .select('id, assigned_partner_id, locked_by')
    .eq('id', payload.service_request_id)
    .single();
  if (!requestRow) {
    return { ok: false, message: '해당 DB를 찾을 수 없습니다.' };
  }

  if (requestRow.assigned_partner_id === payload.partner_id) {
    return { ok: true, message: '이미 결제가 완료된 DB입니다.' };
  }
  if (requestRow.assigned_partner_id) {
    return { ok: false, message: '이미 다른 파트너가 배정받았습니다.' };
  }

  const mileageUsed = payload.mileage_used ?? 0;
  const totalViewPrice = payload.view_price + mileageUsed;

  if (mileageUsed > 0) {
    const { error: mileageErr } = await supabase.rpc('use_partner_mileage', {
      p_partner_id: payload.partner_id,
      p_amount: mileageUsed,
      p_type: 'used_db_purchase',
      p_reference_id: payload.service_request_id,
      p_note: `DB 열람 마일리지 차감 (요청ID: ${payload.service_request_id})`,
    });
    if (mileageErr) {
      return { ok: false, message: mileageErr.message || '마일리지 차감에 실패했습니다.' };
    }
  }

  const { data: confirmResult, error } = await supabase.rpc('confirm_db_purchase', {
    p_service_request_id: payload.service_request_id,
    p_partner_id: payload.partner_id,
    p_amount: payload.view_price,
    p_view_price: totalViewPrice,
    p_completion_price: payload.completion_price,
  });

  if (error) {
    return { ok: false, message: error.message || 'DB 결제 확정에 실패했습니다.' };
  }
  if (!confirmResult?.success) {
    await supabase.rpc('unlock_db_purchase', {
      p_service_request_id: payload.service_request_id,
      p_partner_id: payload.partner_id,
    });
    return { ok: false, message: confirmResult?.error || 'DB 결제 확정에 실패했습니다.' };
  }

  return { ok: true, message: 'DB 열람이 완료되었습니다.' };
}

export async function finalizeProperty(
  supabase: SupabaseClient,
  payload: PropertySessionPayload,
  options?: FinalizePropertyOptions
): Promise<FinalizeResult> {
  const unlockKey = `property:${payload.user_id}:${payload.property_id}:v1`;
  const pgPaymentId = options?.pgPaymentId ?? `external:${unlockKey}`;

  const { data: existingUnlock } = await supabase
    .from('property_unlocks')
    .select('id')
    .eq('user_id', payload.user_id)
    .eq('property_id', payload.property_id)
    .maybeSingle();
  if (existingUnlock) {
    return { ok: true, message: '이미 열람 가능한 매물입니다.' };
  }

  const { data: existingPayment } = await supabase
    .from('payments')
    .select('id')
    .eq('idempotency_key', unlockKey)
    .eq('user_id', payload.user_id)
    .maybeSingle();
  if (existingPayment) {
    return { ok: true, message: '결제 내역이 확인되었습니다.' };
  }

  const insertPayment = await supabase
    .from('payments')
    .insert({
      user_id: payload.user_id,
      property_id: payload.property_id,
      amount: payload.amount,
      pg_payment_id: pgPaymentId,
      idempotency_key: unlockKey,
      status: 'completed',
    })
    .select('id')
    .single();

  if (insertPayment.error) {
    if (insertPayment.error.code !== '23505') {
      return { ok: false, message: insertPayment.error.message || '결제 기록에 실패했습니다.' };
    }
    return { ok: true, message: '결제 내역이 확인되었습니다.' };
  }

  const unlockResult = await supabase.from('property_unlocks').insert({
    user_id: payload.user_id,
    property_id: payload.property_id,
    payment_id: insertPayment.data?.id,
  });
  if (unlockResult.error) {
    if (unlockResult.error.code !== '23505') {
      return { ok: false, message: '열람 권한 생성에 실패했습니다.' };
    }
  }
  return { ok: true, message: '매물 열람이 완료되었습니다.' };
}

export async function finalizeWithdrawal(
  supabase: SupabaseClient,
  payload: WithdrawalSessionPayload
): Promise<FinalizeResult> {
  const { data: withdrawal, error: withdrawalError } = await supabase
    .from('withdrawal_requests')
    .select('id, status, amount, realtor_id')
    .eq('id', payload.withdrawal_id)
    .single();
  if (withdrawalError || !withdrawal) {
    return { ok: false, message: '출금 신청을 찾을 수 없습니다.' };
  }
  if (withdrawal.realtor_id !== payload.realtor_id) {
    return { ok: false, message: '해당 출금 신청과 세션 정보가 일치하지 않습니다.' };
  }
  if (withdrawal.status === 'completed') {
    return { ok: true, message: '이미 출금이 완료된 요청입니다.' };
  }
  if (withdrawal.status !== 'requested' && withdrawal.status !== 'approved') {
    return { ok: false, message: '현재 상태에서는 정산을 완료할 수 없습니다.' };
  }
  if (Math.floor(withdrawal.amount) !== Math.floor(payload.amount)) {
    return { ok: false, message: '출금 금액이 변경되어 결제 요청을 재확인해 주세요.' };
  }

  const { error: updateError } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'completed',
      processed_by: payload.user_id,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', payload.withdrawal_id);
  if (updateError) {
    return { ok: false, message: '출금 상태 업데이트에 실패했습니다.' };
  }

  const { error: settleError } = await supabase
    .from('commissions')
    .update({
      is_settled: true,
      settled_at: new Date().toISOString(),
      withdrawal_id: payload.withdrawal_id,
    })
    .eq('realtor_id', payload.realtor_id)
    .eq('is_settled', false);
  if (settleError) {
    return { ok: false, message: '정산 반영에 실패했습니다.' };
  }

  return { ok: true, message: '출금 처리가 완료되었습니다.' };
}
