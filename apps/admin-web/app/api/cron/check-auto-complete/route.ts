// 명령어16: 크론에서 호출하는 자동완료 처리 API
// reserved + auto_complete_at <= 오늘 인 건을 completed로 전환 (알림톡 없음).
// 고객 알림톡 + 전체완료 전환은 partner-reminders 크론이 매일 12:00 KST에 수행 (예약일+1일 12시 자동화).
// Vercel Cron 또는 외부 스케줄러에서 POST 호출 (CRON_SECRET으로 인증)
import { NextRequest, NextResponse } from 'next/server';
import { checkAutoComplete } from '@/lib/api/requests';
import { notifyCronFailure } from '@/lib/cron-notify';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'check-auto-complete';

async function getHandler(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    console.error('CRON_SECRET 환경변수가 설정되지 않았습니다.');
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }
  if (authHeader !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { processed } = await checkAutoComplete();
    return NextResponse.json({ success: true, processed });
  } catch (e) {
    await notifyCronFailure(JOB_NAME, e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '오류' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));

async function postHandler(request: NextRequest) {
  return getHandler(request);
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
