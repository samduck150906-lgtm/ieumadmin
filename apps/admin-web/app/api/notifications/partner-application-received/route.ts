/**
 * 랜딩 페이지에서 파트너(공인중개사/제휴업체) 신청 접수 시 관리자 알림
 * - 랜딩 페이지 /api/partner/apply 에서 성공 후 호출
 * - Authorization: Bearer {CRON_SECRET} 필수
 * - ADMIN_NOTIFY_PHONES: 알림 받을 관리자 번호 (쉼표 구분, 예: "01012345678,01087654321")
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendSms } from '@/lib/alimtalk';
import { withErrorHandler } from '@/lib/api/error-handler';

function authCheck(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get('Authorization') === `Bearer ${secret}`;
}

async function postHandler(request: NextRequest) {
  if (!authCheck(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { applicationId, businessName, managerName, managerPhone, category } = body as {
      applicationId?: string;
      businessName?: string;
      managerName?: string;
      managerPhone?: string;
      category?: string;
    };

    const categoryLabel: Record<string, string> = {
      realtor: '공인중개사',
      moving: '이사',
      cleaning: '청소',
      internet: '인터넷',
      interior: '인테리어',
      etc: '기타',
    };
    const categoryName = categoryLabel[category ?? ''] ?? category ?? '알 수 없음';

    // 관리자 SMS 발송 (ADMIN_NOTIFY_PHONES 환경변수 설정 시)
    const notifyPhones = process.env.ADMIN_NOTIFY_PHONES;
    let smsSentCount = 0;
    if (notifyPhones) {
      const phones = notifyPhones.split(',').map((p) => p.trim()).filter(Boolean);
      const message =
        `[이음] 새 파트너 신청 접수\n` +
        `업종: ${categoryName}\n` +
        `업체명: ${businessName || '-'}\n` +
        `담당자: ${managerName || '-'} (${managerPhone || '-'})\n` +
        `관리자 전산에서 확인해주세요.`;

      await Promise.allSettled(
        phones.map((phone) => sendSms({ phone, message }).then((r) => { if (r.success) smsSentCount++; }))
      );
    }

    // 알림 로그 기록
    const supabase = createServerClient();
    if (supabase && applicationId) {
      try {
        await supabase.from('notification_logs').insert({
          notification_type: 'partner_application_admin_notify',
          channel: 'sms',
          recipient_name: '관리자',
          recipient_phone: notifyPhones?.split(',')[0]?.trim() || null,
          message_content: JSON.stringify({ applicationId, businessName, category }),
          is_sent: smsSentCount > 0,
        });
      } catch (e) {
        console.error('[partner-application-received] 로그 기록 실패:', e);
      }
    }

    return NextResponse.json({ success: true, smsSentCount });
  } catch (e) {
    console.error('[파트너 신청 관리자 알림 오류]:', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '알림 처리 오류' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
