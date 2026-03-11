import { NextRequest, NextResponse } from 'next/server';
import { sendSignupNotification } from '@/lib/notifications';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 랜딩/폼에서 고객 신청 완료 알림 발송 (알리고·카카오) */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const { phone, name, serviceNames } = body as {
      phone?: string;
      name?: string;
      serviceNames?: string[];
    };
    if (!phone || !name || !Array.isArray(serviceNames)) {
      return NextResponse.json(
        { error: 'phone, name, serviceNames 필요' },
        { status: 400 }
      );
    }
    await sendSignupNotification(phone, name, serviceNames);
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '발송 오류' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
