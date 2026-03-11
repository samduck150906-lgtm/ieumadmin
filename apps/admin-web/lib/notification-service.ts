import { sendAlimtalk, sendSms } from './alimtalk';
import { NOTIFICATION_TEMPLATES, NotificationTemplateKey } from './notification-templates';
import { createServerClient } from './supabase';

/**
 * 통합 알림 발송 서비스
 * - 알림톡 발송 시도 → 실패 시 SMS 대체 발송
 * - notification_logs에 결과 기록 (기존 스키마: recipient_phone, notification_type, channel, message_content, is_sent, error_message)
 */
export async function sendNotification(params: {
  templateKey: NotificationTemplateKey;
  recipientPhone: string;
  recipientName: string;
  variables: Record<string, string>;
  serviceRequestId?: string;
  eventKey?: string;
  recipientId?: string;
}): Promise<{ success: boolean; skipped?: boolean }> {
  const { templateKey, recipientPhone, recipientName, variables, serviceRequestId, eventKey, recipientId } = params;
  const template = NOTIFICATION_TEMPLATES[templateKey];
  // templateKey별로 variables 형태가 다르며, 호출부에서 올바른 변수를 전달함. 타입 단언으로 통과.
  const messageContent = (template.buildMessage as (v: Record<string, string>) => string)(variables);

  const supabase = createServerClient();

  // 0. eventKey 기반 중복 발송 방지 (이미 발송된 동일 이벤트는 스킵)
  if (supabase && eventKey) {
    try {
      const { data: existingLog } = await supabase
        .from('notification_logs')
        .select('id, is_sent, status')
        .eq('event_key', eventKey)
        .limit(1)
        .maybeSingle();

      if (existingLog && (existingLog.is_sent || existingLog.status === 'sent')) {
        return { success: true, skipped: true };
      }
    } catch {
      // dedupe 조회 실패 시 발송 자체는 계속 진행
    }
  }

  // 1. 알림톡 발송 시도
  const alimtalkResult = await sendAlimtalk({
    phone: recipientPhone,
    templateCode: template.templateCode,
    variables: { name: recipientName, ...variables },
    fallbackMessage: messageContent,
  });

  // 2. 로그 저장 (event_key 포함)
  if (supabase) {
    try {
      await supabase
        .from('notification_logs')
        .insert({
          recipient_phone: recipientPhone,
          recipient_name: recipientName,
          recipient_id: recipientId ?? null,
          notification_type: templateKey,
          channel: alimtalkResult.success ? 'alimtalk' : 'sms',
          message_content: messageContent,
          service_request_id: serviceRequestId ?? null,
          is_sent: alimtalkResult.success,
          status: alimtalkResult.success ? 'sent' : 'failed',
          sent_at: alimtalkResult.success ? new Date().toISOString() : null,
          error_message: alimtalkResult.error ?? null,
          event_key: eventKey ?? null,
        });
    } catch {
      // 로그 저장 실패가 알림 발송 실패를 만들지 않도록 무시
    }
  }

  // 3. 알림톡 실패 시 SMS 대체 발송
  if (!alimtalkResult.success) {
    const smsResult = await sendSms({
      phone: recipientPhone,
      message: messageContent,
      title: '[이음]',
    });

    if (supabase) {
      try {
        await supabase
          .from('notification_logs')
          .insert({
            recipient_phone: recipientPhone,
            recipient_name: recipientName,
            recipient_id: recipientId ?? null,
            notification_type: `${templateKey}_FALLBACK`,
            channel: 'sms',
            message_content: messageContent,
            service_request_id: serviceRequestId ?? null,
            is_sent: smsResult.success,
            status: smsResult.success ? 'sent' : 'failed',
            sent_at: smsResult.success ? new Date().toISOString() : null,
            error_message: smsResult.error ?? null,
            event_key: eventKey ? `${eventKey}:fallback` : null,
          });
      } catch {
        // 로그 저장 실패 무시
      }
    }

    return { success: smsResult.success };
  }

  return { success: true };
}

/**
 * 실패한 알림 재시도 (크론용)
 * - is_sent = false 인 notification_logs 건을 SMS로 재발송 후 성공 시 로그 갱신
 * - 반환: { processed, sent }
 */
export async function retryFailedNotifications(): Promise<{ processed: number; sent: number }> {
  const supabase = createServerClient();
  if (!supabase) {
    return { processed: 0, sent: 0 };
  }

  const { data: failed, error: fetchError } = await supabase
    .from('notification_logs')
    .select('id, recipient_phone, recipient_name, message_content')
    .eq('is_sent', false)
    .not('message_content', 'is', null)
    .order('created_at', { ascending: true })
    .limit(50);

  if (fetchError || !failed?.length) {
    return { processed: 0, sent: 0 };
  }

  let sent = 0;
  for (const row of failed) {
    const phone = row.recipient_phone;
    const message = row.message_content ?? '';
    if (!phone || !message) continue;

    const smsResult = await sendSms({
      phone,
      message,
      title: '[이음]',
    });

    if (smsResult.success) {
      await supabase
        .from('notification_logs')
        .update({
          is_sent: true,
          sent_at: new Date().toISOString(),
          channel: 'sms',
          error_message: null,
        })
        .eq('id', row.id);
      sent += 1;
    }
  }

  return { processed: failed.length, sent };
}
