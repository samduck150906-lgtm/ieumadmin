/**
 * 알림 실패 재시도 크론
 * - status='failed', retry_count < 3 인 건을 SMS로 재발송
 * 호출: GET/POST /api/cron/retry-notifications (Authorization: Bearer CRON_SECRET)
 */
import { NextRequest, NextResponse } from 'next/server';
import { retryFailedNotifications } from '@/lib/notification-service';
import { notifyCronFailure } from '@/lib/cron-notify';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'retry-notifications';

function authCheck(request: NextRequest): { ok: boolean; status?: number; body?: object } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET 환경변수가 설정되지 않았습니다.');
    return { ok: false, status: 500, body: { error: 'Server configuration error' } };
  }
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  return { ok: true };
}

async function getHandler(request: NextRequest) {
  const check = authCheck(request);
  if (!check.ok) {
    return NextResponse.json(check.body, { status: check.status ?? 401 });
  }
  return runRetry();
}

async function postHandler(request: NextRequest) {
  const check = authCheck(request);
  if (!check.ok) {
    return NextResponse.json(check.body, { status: check.status ?? 401 });
  }
  return runRetry();
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));

async function runRetry() {
  try {
    const { processed, sent } = await retryFailedNotifications();
    return NextResponse.json({ success: true, processed, sent });
  } catch (e) {
    console.error('[retry-notifications]', e);
    await notifyCronFailure(JOB_NAME, e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '재시도 오류' },
      { status: 500 }
    );
  }
}
