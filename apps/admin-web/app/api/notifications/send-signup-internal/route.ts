/**
 * 고객 신청 완료 알림 발송 (서버 간 호출용)
 * - 랜딩/폼 API에서 고객 생성 성공 후 ADMIN_API_URL + CRON_SECRET으로 호출
 * - Authorization: Bearer {CRON_SECRET} 필수
 */
import { NextRequest, NextResponse } from 'next/server';
import { sendNotification } from '@/lib/notification-service';
import { withErrorHandler } from '@/lib/api/error-handler';

function authCheck(request: NextRequest): { ok: boolean; status?: number; body?: object } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return { ok: false, status: 500, body: { error: 'Server configuration error' } };
  }
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  return { ok: true };
}

async function postHandler(request: NextRequest) {
  const check = authCheck(request);
  if (!check.ok) {
    return NextResponse.json(check.body, { status: check.status ?? 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { phone, name, serviceNames, customerId } = body as {
      phone?: string;
      name?: string;
      serviceNames?: string[];
      customerId?: string;
    };
    if (!phone || !name || !Array.isArray(serviceNames)) {
      return NextResponse.json(
        { error: 'phone, name, serviceNames 필요' },
        { status: 400 }
      );
    }
    const servicesStr = serviceNames.join(', ');
    const eventKey = customerId ? `signup:${customerId}` : `signup:${phone}:${name}`;
    const result = await sendNotification({
      templateKey: 'CUSTOMER_APPLY_COMPLETE',
      recipientPhone: phone,
      recipientName: name,
      variables: { services: servicesStr },
      eventKey,
      recipientId: customerId,
    });
    return NextResponse.json({
      success: result.success,
      skipped: result.skipped ?? false,
    });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '발송 오류' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
