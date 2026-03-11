import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { updateRealtorStatus } from '@/lib/api/realtors';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 공인중개사 본인 회원 탈퇴(비활성화) */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return unauthorizedResponse();

  if (session.role !== 'realtor') {
    return NextResponse.json({ error: '공인중개사 계정만 탈퇴할 수 있습니다.' }, { status: 403 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const reason = (body as { reason?: string })?.reason;
    if (reason) {
      // 추후 탈퇴 사유 저장 시 leave_reasons 테이블 INSERT로 대체 예정
      // 개인정보(탈퇴 사유) 를 서버 로그에 남기지 않음
    }

    await updateRealtorStatus(session.userId, 'inactive');
    return NextResponse.json({ success: true, message: '탈퇴 처리되었습니다.' });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '탈퇴 처리에 실패했습니다.' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
