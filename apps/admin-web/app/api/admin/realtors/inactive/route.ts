import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';
import { getInactiveRealtors } from '@/lib/api/realtors';

/**
 * 2주(14일) 이상 미활동 공인중개사 조회 API
 * 활동 = 로그인 OR 고객 신청 발생
 * - 관리자 대시보드 리스트업, 알림톡/푸시 발송 대상자 분류에 사용
 */
async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const { searchParams } = new URL(request.url);
  const inactiveDays = Math.min(90, Math.max(1, parseInt(searchParams.get('days') ?? '14', 10) || 14));
  const limit = Math.min(500, Math.max(1, parseInt(searchParams.get('limit') ?? '100', 10) || 100));

  const { data, total } = await getInactiveRealtors({ inactiveDays, limit });

  return NextResponse.json({
    success: true,
    data,
    total,
    inactiveDays,
    message: `${inactiveDays}일 이상 미활동 공인중개사 ${total}명`,
  });
}

export const GET = withErrorHandler((req: Request) => getHandler(req as NextRequest));
