import { getSupabase } from '../supabase';
import { sanitizeSearchQuery } from '@/lib/sanitize';

// ── 환경변수 (서버 전용, NEXT_PUBLIC 사용 금지) ─────────────────────────────
// 알림톡 tpl_code: 알리고 사이트(https://smartsms.aligo.in) > 템플릿 관리에서 등록·승인된 코드 사용
// 내부 코드(signup_complete 등) → 알리고 tpl_code 매핑: ALIGO_TPL_SIGNUP_COMPLETE 등으로 오버라이드 가능
const ALIGO_API_URL = 'https://apis.aligo.in';
const ALIGO_ALIMTALK_URL = 'https://kakaoapi.aligo.in/akv10/alimtalk/send/';

const getEnv = () => ({
  apiKey: process.env.ALIGO_API_KEY || '',
  userId: process.env.ALIGO_USER_ID || '',
  sender: process.env.ALIGO_SENDER || '',
  senderKey: process.env.KAKAO_SENDER_KEY || '',
  failureWebhook: process.env.CRON_FAILURE_WEBHOOK || process.env.SLACK_WEBHOOK_CRON || process.env.NOTIFICATION_FAILURE_WEBHOOK || '',
});

/** 알리고 tpl_code 매핑. 환경변수로 오버라이드 가능 (예: ALIGO_TPL_SIGNUP_COMPLETE=TI_1234) */
function getAligoTplCode(internalCode: string): string {
  const envKey = `ALIGO_TPL_${internalCode.toUpperCase().replace(/-/g, '_')}`;
  const override = process.env[envKey];
  if (override) return override;
  // 기본: 내부 코드 그대로 전달. 알리고에 해당 코드로 템플릿 등록했을 경우에만 동작
  return internalCode;
}

// ── 재시도 유틸 (지수 백오프) ─────────────────────────────────────────────
async function withRetry<T>(
  fn: () => Promise<T>,
  options: { maxRetries?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 500 } = options;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastError;
}

// ── 관리자 알림 (Failover) ───────────────────────────────────────────────
async function notifyAdminFailure(params: {
  channel: 'alimtalk' | 'sms';
  phone: string;
  error: string;
  templateCode?: string;
}) {
  const { failureWebhook } = getEnv();
  if (!failureWebhook) return;

  try {
    const payload = {
      text: `[이음 알림 발송 실패]\n채널: ${params.channel}\n수신: ${params.phone}\n템플릿: ${params.templateCode || '-'}\n오류: ${params.error}`,
    };
    await fetch(failureWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    // 웹훅 실패 시 무시 (무한 루프 방지)
  }
}

// ── 알림 발송 이력 조회 ───────────────────────────────────────────────────
export async function getNotificationLogs(params?: {
  search?: string;
  type?: string;
  page?: number;
  limit?: number;
}) {
  const supabase = getSupabase();
  const { search, type, page = 1, limit = 20 } = params || {};

  let query = supabase
    .from('notification_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    const sanitized = sanitizeSearchQuery(search);
    if (sanitized) {
      query = query.or(`recipient_name.ilike.%${sanitized}%,recipient_phone.ilike.%${sanitized}%`);
    }
  }

  if (type) {
    query = query.eq('notification_type', type);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

// ── 알림 발송 기록 저장 ─────────────────────────────────────────────────
export async function createNotificationLog(params: {
  recipientPhone: string;
  recipientName?: string;
  notificationType: string;
  channel: 'alimtalk' | 'sms' | 'lms';
  templateCode?: string;
  messageContent: string;
  serviceRequestId?: string;
  isSent: boolean;
  errorMessage?: string;
}) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('notification_logs')
    .insert({
      recipient_phone: params.recipientPhone,
      recipient_name: params.recipientName,
      notification_type: params.notificationType,
      channel: params.channel,
      template_code: params.templateCode,
      message_content: params.messageContent,
      service_request_id: params.serviceRequestId,
      is_sent: params.isSent,
      sent_at: params.isSent ? new Date().toISOString() : null,
      error_message: params.errorMessage,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ── 템플릿에서 메시지 생성 ───────────────────────────────────────────────
function generateMessageFromTemplate(templateCode: string, variables: Record<string, string>): string {
  const templates: Record<string, string> = {
    signup_complete: `'이음' 에서 {{신청항목}} 신청이 완료되었습니다.
최대 24시간 이내 각 전문가에게 연락이 갈 예정입니다.`,
    assigned: `'{{카테고리}}' 업체 '{{업체명}}'이(가) 배정되었습니다.
'{{담당자명}}'
'{{담당자연락처}}'
빠른 시간안에 위 담당자로부터 연락이 갈 예정입니다.`,
    cancelled: `'{{취소내역}}' 신청을 취소하셨군요.
취소 이유를 알려주시면 보다 나은 서비스로 보답하겠습니다.
(다른곳에서 신청 / 이사가 취소됨 / 보류중 / 기타사유)`,
    review_request: `'{{신청내역}}'이(가) 완료되었습니다.
평점 및 후기를 남겨주세요.`,
  };

  let message = templates[templateCode] || '';
  Object.entries(variables).forEach(([key, value]) => {
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });
  return message;
}

// ── 알림톡 발송 (Aligo/카카오 API 실제 호출) ──────────────────────────────
export async function sendAlimtalk(params: {
  phone: string;
  name?: string;
  templateCode: string;
  variables: Record<string, string>;
  serviceRequestId?: string;
}) {
  const { apiKey, userId, sender, senderKey } = getEnv();
  const messageContent = generateMessageFromTemplate(params.templateCode, params.variables);
  const phone = params.phone.replace(/[^0-9]/g, '');

  const saveLog = async (isSent: boolean, channel: 'alimtalk' | 'sms', errorMessage?: string) => {
    await createNotificationLog({
      recipientPhone: params.phone,
      recipientName: params.name,
      notificationType: params.templateCode,
      channel,
      templateCode: params.templateCode,
      messageContent,
      serviceRequestId: params.serviceRequestId,
      isSent,
      errorMessage,
    });
  };

  // 알림톡 발송 시도 (알리고 akv10 API)
  // tpl_code: 알리고에 등록·승인된 템플릿 코드. 환경변수 ALIGO_TPL_XXX로 매핑 가능
  const tplCode = getAligoTplCode(params.templateCode)?.trim();
  if (apiKey && userId && sender && senderKey && tplCode) {
    try {
      await withRetry(async () => {
        const formData = new URLSearchParams({
          apikey: apiKey,
          userid: userId,
          senderkey: senderKey,
          tpl_code: tplCode,
          sender,
          receiver_1: phone,
          recvname_1: params.name || '고객',
          subject_1: params.templateCode,
          message_1: messageContent,
          failover: 'Y',
          fsubject_1: '[이음]',
          fmessage_1: messageContent,
        });

        const res = await fetch(ALIGO_ALIMTALK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        });

        const json = await res.json();

        if (json.code === 0) {
          return;
        }
        throw new Error(json.message || `알림톡 발송 실패 (code: ${json.code})`);
      });

      await saveLog(true, 'alimtalk');
      return { success: true };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '알림톡 발송 실패';
      await saveLog(false, 'alimtalk', errorMsg);
      await notifyAdminFailure({
        channel: 'alimtalk',
        phone: params.phone,
        error: errorMsg,
        templateCode: params.templateCode,
      });

      // Failover: SMS로 대체 발송
      const smsResult = await sendSMS({
        phone: params.phone,
        name: params.name,
        message: messageContent,
        serviceRequestId: params.serviceRequestId,
      });

      return { success: smsResult.success };
    }
  }

  // 환경변수 미설정: SMS로 대체
  await saveLog(false, 'alimtalk', '알림톡 환경변수 미설정 (ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER, KAKAO_SENDER_KEY)');
  return sendSMS({
    phone: params.phone,
    name: params.name,
    message: messageContent,
    serviceRequestId: params.serviceRequestId,
  });
}

// ── SMS 발송 (Aligo API 실제 호출) ────────────────────────────────────────
export async function sendSMS(params: {
  phone: string;
  name?: string;
  message: string;
  serviceRequestId?: string;
}) {
  const { apiKey, userId, sender, failureWebhook } = getEnv();
  const phone = params.phone.replace(/[^0-9]/g, '');
  const isLMS = new Blob([params.message]).size > 80;

  const saveLog = async (isSent: boolean, errorMessage?: string) => {
    await createNotificationLog({
      recipientPhone: params.phone,
      recipientName: params.name,
      notificationType: 'sms',
      channel: isLMS ? 'lms' : 'sms',
      messageContent: params.message,
      serviceRequestId: params.serviceRequestId,
      isSent,
      errorMessage,
    });
  };

  if (!apiKey || !userId || !sender) {
    await saveLog(false, 'API 키가 설정되지 않았습니다. (ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER)');
    return { success: false };
  }

  try {
    const result = await withRetry(async () => {
      const formData = new URLSearchParams({
        key: apiKey,
        user_id: userId,
        sender,
        receiver: phone,
        msg: params.message,
        msg_type: isLMS ? 'LMS' : 'SMS',
      });

      const res = await fetch(`${ALIGO_API_URL}/send/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });

      const json = await res.json();

      if (json.result_code === '1') {
        return { success: true };
      }
      throw new Error(json.message || `SMS 발송 실패 (result_code: ${json.result_code})`);
    });

    await saveLog(true);
    return { success: true };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'SMS 발송 실패';
    await saveLog(false, errorMsg);

    if (failureWebhook) {
      await notifyAdminFailure({
        channel: 'sms',
        phone: params.phone,
        error: errorMsg,
      });
    }

    return { success: false };
  }
}

// ── 시나리오별 발송 함수 ───────────────────────────────────────────────────

export async function sendSignupCompleteNotification(
  customerPhone: string,
  customerName: string,
  serviceName: string,
  categories: string[]
) {
  return sendAlimtalk({
    phone: customerPhone,
    name: customerName,
    templateCode: 'signup_complete',
    variables: {
      '서비스명': serviceName,
      '신청항목': categories.join(', '),
    },
  });
}

export async function sendAssignmentNotification(
  customerPhone: string,
  customerName: string,
  category: string,
  partnerName: string,
  managerName: string,
  managerPhone: string,
  serviceRequestId: string
) {
  return sendAlimtalk({
    phone: customerPhone,
    name: customerName,
    templateCode: 'assigned',
    variables: {
      '카테고리': category,
      '업체명': partnerName,
      '담당자명': managerName,
      '담당자연락처': managerPhone,
    },
    serviceRequestId,
  });
}

export async function sendReviewRequestNotification(
  customerPhone: string,
  customerName: string,
  categoryName: string,
  serviceRequestId: string
) {
  return sendAlimtalk({
    phone: customerPhone,
    name: customerName,
    templateCode: 'review_request',
    variables: {
      '신청내역': categoryName,
    },
    serviceRequestId,
  });
}
