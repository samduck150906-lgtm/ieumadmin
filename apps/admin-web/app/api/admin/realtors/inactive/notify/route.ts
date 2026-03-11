import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { sendSMS } from '@/lib/api/notifications';
import { sendExpoPushToMany } from '@/lib/expo-push';
import { getInactiveRealtors } from '@/lib/api/realtors';

const notifySchema = z.object({
  /** 미활동 일수 (기본 14) */
  inactiveDays: z.number().min(1).max(90).optional().default(14),
  /** 발송 채널: sms | push | both */
  channel: z.enum(['sms', 'push', 'both']).optional().default('both'),
});

const INACTIVE_MESSAGE =
  '[이음] 안녕하세요. 오랫동안 앱에 접속하지 않으셨네요. 새로운 고객 리드와 수익 기회를 놓치지 마세요. 앱을 열어 확인해 보세요!';

/**
 * 2주 이상 미활동 중개사에게 SMS 및/또는 푸시 알림 발송
 */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    throw new ApiError('서버 설정 오류', 500);
  }

  let body: z.infer<typeof notifySchema> = { inactiveDays: 14, channel: 'both' };
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = notifySchema.safeParse(raw);
    if (parsed.success) body = parsed.data;
  } catch {
    // 기본값 사용
  }
  const { inactiveDays, channel } = body;

  const { data: realtors } = await getInactiveRealtors({
    inactiveDays,
    limit: 500,
  });

  if (realtors.length === 0) {
    return NextResponse.json({
      success: true,
      sent: { sms: 0, push: 0 },
      total: 0,
      message: '미활동 중개사가 없습니다.',
    });
  }

  let smsSent = 0;
  let pushSent = 0;
  const pushTokens: string[] = [];

  for (const r of realtors) {
    const phone = r.contact_phone || r.user?.phone;
    const name = r.contact_name || r.user?.name || r.business_name || '중개사';

    if ((channel === 'sms' || channel === 'both') && phone) {
      const normalized = phone.replace(/[^0-9]/g, '');
      if (normalized.length >= 10) {
        const result = await sendSMS({
          phone: normalized,
          name,
          message: INACTIVE_MESSAGE,
        });
        if (result.success) smsSent += 1;
      }
    }

    if ((channel === 'push' || channel === 'both') && r.user?.expo_push_token) {
      const token = r.user.expo_push_token.trim();
      if (token && (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))) {
        pushTokens.push(token);
      }
    }
  }

  if (pushTokens.length > 0) {
    const { sent } = await sendExpoPushToMany(
      pushTokens,
      '[이음] 오랫동안 접속하지 않으셨네요',
      '새로운 고객 리드와 수익 기회를 놓치지 마세요. 앱을 열어 확인해 보세요!',
      { url: '/', type: 'inactive_reminder' }
    );
    pushSent = sent;
  }

  return NextResponse.json({
    success: true,
    sent: { sms: smsSent, push: pushSent },
    total: realtors.length,
    message: `${realtors.length}명 중 SMS ${smsSent}건, 푸시 ${pushSent}건 발송 완료`,
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
