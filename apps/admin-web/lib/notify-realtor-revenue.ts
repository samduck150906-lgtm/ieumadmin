/**
 * 공인중개사 수익 실시간 알림 발송 (SMS + 로그)
 * - commissions INSERT 후 호출: consultation / conversion / referral
 * - API route 및 checkAutoComplete 등에서 공통 사용
 */
import { createServerClient } from '@/lib/supabase-server';
import { sendSms } from '@/lib/alimtalk';

export type RealtorRevenueType = 'expected' | 'converted' | 'referral' | 'consultation';

const REVENUE_TYPE_LABELS: Record<RealtorRevenueType, string> = {
  expected: '예정수익금',
  converted: '전환수익금',
  referral: '추천수익금',
  consultation: '상담요청 수익금',
};

export interface SendRealtorRevenueNotificationParams {
  realtorId: string;
  revenueType: RealtorRevenueType;
  amount: number;
  serviceRequestId?: string | null;
}

export interface SendRealtorRevenueNotificationResult {
  success: boolean;
  skipped?: boolean;
  reason?: string;
}

/**
 * 공인중개사 수익 변동 알림 발송 (notify_commission_increase 확인 후 SMS + notification_logs)
 */
export async function sendRealtorRevenueNotification(
  params: SendRealtorRevenueNotificationParams
): Promise<SendRealtorRevenueNotificationResult> {
  const { realtorId, revenueType, amount, serviceRequestId } = params;
  const supabase = createServerClient();
  if (!supabase) {
    return { success: false };
  }

  const { data: realtor, error } = await supabase
    .from('realtors')
    .select('id, business_name, contact_phone, notify_commission_increase')
    .eq('id', realtorId)
    .single();

  if (error || !realtor) {
    return { success: false };
  }

  if ((realtor as { notify_commission_increase?: boolean }).notify_commission_increase === false) {
    return { success: true, skipped: true, reason: '알림 수신 꺼짐' };
  }

  const phone = realtor.contact_phone;
  if (!phone) {
    return { success: false };
  }

  const typeLabel = REVENUE_TYPE_LABELS[revenueType] ?? revenueType;
  const formattedAmount = new Intl.NumberFormat('ko-KR').format(amount);
  const message = `[이음] ${realtor.business_name || '중개사'}님, ${typeLabel}이 +${formattedAmount}원 변동되었습니다. 앱에서 확인해 주세요.`;

  const smsResult = await sendSms({ phone, message });

  await supabase.from('notification_logs').insert({
    recipient_phone: phone,
    recipient_name: realtor.business_name,
    notification_type: `REALTOR_REVENUE_${revenueType.toUpperCase()}`,
    channel: 'sms',
    message_content: message,
    service_request_id: serviceRequestId ?? null,
    is_sent: smsResult.success,
    sent_at: smsResult.success ? new Date().toISOString() : null,
    error_message: smsResult.error ?? null,
  });

  return { success: smsResult.success };
}
