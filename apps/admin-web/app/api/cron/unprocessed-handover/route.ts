/**
 * 미완료 처리 자동화
 * - 배정 후 N일 이상 미처리(상담예정/열람 등) 방치 시:
 *   - 본사: hq_status → 'hq_review_needed' (본사확인필요)
 *   - 업체: partner_assignments.status → 'pending' (보류)
 * 호출: GET/POST /api/cron/unprocessed-handover (Authorization: Bearer CRON_SECRET)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { serverLogger } from '@/lib/observability/logger';
import { notifyCronFailure } from '@/lib/cron-notify';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const JOB_NAME = 'unprocessed-handover';
const UNPROCESSED_DAYS = 3; // 배정 후 3일 이상 미처리 시 전환

function authCheck(request: NextRequest): { ok: boolean; status?: number; body?: object } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    serverLogger.error('CRON_SECRET 환경변수가 설정되지 않았습니다.', { path: '/api/cron/unprocessed-handover' });
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
  try {
    return await runUnprocessedHandover();
  } catch (e) {
    await notifyCronFailure(JOB_NAME, e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '오류' },
      { status: 500 }
    );
  }
}

async function postHandler(request: NextRequest) {
  const check = authCheck(request);
  if (!check.ok) {
    return NextResponse.json(check.body, { status: check.status ?? 401 });
  }
  try {
    return await runUnprocessedHandover();
  } catch (e) {
    await notifyCronFailure(JOB_NAME, e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '오류' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));

async function runUnprocessedHandover() {
  const supabase = createServerClient();
  if (!supabase) {
    serverLogger.error('Supabase 미설정', { path: '/api/cron/unprocessed-handover' });
    return NextResponse.json({ error: 'Supabase 미설정' }, { status: 500 });
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - UNPROCESSED_DAYS);
  const cutoffIso = cutoffDate.toISOString();

  // 배정되었으나 unread/read/consulting 상태로 N일 이상 경과한 partner_assignments
  const { data: staleAssignments, error: fetchError } = await supabase
    .from('partner_assignments')
    .select('id, service_request_id')
    .in('status', ['unread', 'read', 'consulting'])
    .lt('created_at', cutoffIso);

  if (fetchError) {
    serverLogger.error('미완료 조회 실패', { error: fetchError.message });
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!staleAssignments?.length) {
    return NextResponse.json({ success: true, processed: 0 });
  }

  const paIds = staleAssignments.map((pa) => pa.id);
  const srIds = Array.from(new Set(staleAssignments.map((pa) => pa.service_request_id).filter(Boolean)));

  // 1. partner_assignments.status → pending (보류)
  const { error: paError } = await supabase
    .from('partner_assignments')
    .update({ status: 'pending', updated_at: new Date().toISOString() })
    .in('id', paIds);

  if (paError) {
    serverLogger.error('partner_assignments 보류 전환 실패', { error: paError.message });
    return NextResponse.json({ error: paError.message }, { status: 500 });
  }

  // 2. service_requests.hq_status → hq_review_needed (본사확인필요)
  const { error: srError } = await supabase
    .from('service_requests')
    .update({ hq_status: 'hq_review_needed', updated_at: new Date().toISOString() })
    .in('id', srIds);

  if (srError) {
    serverLogger.error('service_requests 본사확인필요 전환 실패', { error: srError.message });
    return NextResponse.json({ error: srError.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    processed: staleAssignments.length,
    partnerAssignments: paIds.length,
    serviceRequests: srIds.length,
  });
}
