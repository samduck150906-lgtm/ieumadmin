// 명령어17: 미처리 방치 시 본사 본사확인필요, 업체 보류 자동 전환
// Vercel Cron에서 호출 (CRON_SECRET으로 인증)
import { NextRequest, NextResponse } from 'next/server';
import { markStalledAssignments } from '@/lib/api/requests';
import { notifyCronFailure } from '@/lib/cron-notify';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'mark-stalled';

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
    const { processed } = await markStalledAssignments();
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
