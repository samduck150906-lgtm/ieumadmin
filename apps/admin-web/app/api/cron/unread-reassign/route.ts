/**
 * 2시간 미열람 자동 재배정 크론
 * - partner_assignments.status = 'unread' 이고 created_at이 2시간 전 이전인 건
 * - 배정 해제 후 다른 업체에 자동 랜덤 재배정 (동일 카테고리, 직전 업체 제외)
 * - 재배정 제한: reassign_count < max_reassign_count (3회)
 * 호출: GET/POST /api/cron/unread-reassign (Authorization: Bearer CRON_SECRET)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { serverLogger } from '@/lib/observability/logger';
import { notifyCronFailure } from '@/lib/cron-notify';
import { assignPartnerWithClient } from '@/lib/api/requests';
import { getRandomPartner } from '@/lib/api/partners';
import type { ServiceCategory } from '@/types/database';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JOB_NAME = 'unread-reassign';
const UNREAD_THRESHOLD_HOURS = 2;
const MAX_REASSIGN_COUNT = 3;
const ASSIGNED_BY_CRON = 'cron:unread-reassign';

function authCheck(request: NextRequest): { ok: boolean; status?: number; body?: object } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    serverLogger.error('CRON_SECRET 환경변수가 설정되지 않았습니다.', {
      path: '/api/cron/unread-reassign',
    });
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
    return await runUnreadReassign();
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
    return await runUnreadReassign();
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

async function runUnreadReassign() {
  const supabase = createServerClient();
  if (!supabase) {
    serverLogger.error('Supabase 미설정', { path: '/api/cron/unread-reassign' });
    return NextResponse.json({ error: 'Supabase 미설정' }, { status: 500 });
  }

  const threshold = new Date(Date.now() - UNREAD_THRESHOLD_HOURS * 60 * 60 * 1000).toISOString();

  const { data: unreadAssignments, error: fetchErr } = await supabase
    .from('partner_assignments')
    .select('id, service_request_id, partner_id')
    .eq('status', 'unread')
    .lt('created_at', threshold);

  if (fetchErr) {
    serverLogger.error('미열람 배정 조회 오류', { error: fetchErr });
    return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  }

  const list = unreadAssignments || [];
  let processed = 0;
  let reassigned = 0;

  for (const pa of list) {
    const { data: sr } = await supabase
      .from('service_requests')
      .select('reassign_count, category')
      .eq('id', pa.service_request_id)
      .single();

    const reassignCount = sr?.reassign_count ?? 0;
    if (reassignCount >= MAX_REASSIGN_COUNT) {
      serverLogger.info('재배정 한도 초과로 스킵', {
        serviceRequestId: pa.service_request_id,
        reassignCount,
        max: MAX_REASSIGN_COUNT,
      });
      continue;
    }

    const { error: updatePaErr } = await supabase
      .from('partner_assignments')
      .update({
        status: 'cancelled',
        cancel_reason: 'other_partner',
        cancel_reason_detail: '2시간 미열람 자동 재배정',
        updated_at: new Date().toISOString(),
      })
      .eq('id', pa.id);

    if (updatePaErr) {
      serverLogger.error('배정 취소 오류', { assignmentId: pa.id, error: updatePaErr });
      continue;
    }

    const now = new Date().toISOString();
    const { error: updateSrErr } = await supabase
      .from('service_requests')
      .update({
        assigned_partner_id: null,
        assigned_at: null,
        assigned_by: null,
        hq_status: 'unread',
        reassign_count: reassignCount + 1,
        last_reassigned_at: now,
        updated_at: now,
      })
      .eq('id', pa.service_request_id);

    if (updateSrErr) {
      serverLogger.error('서비스 요청 배정 해제 오류', {
        serviceRequestId: pa.service_request_id,
        error: updateSrErr,
      });
      continue;
    }

    processed++;

    // 다른 업체에 자동 랜덤 재배정 (직전 업체 제외)
    const category = sr?.category as ServiceCategory | undefined;
    if (!category) {
      serverLogger.warn('재배정 스킵: 카테고리 없음', { serviceRequestId: pa.service_request_id });
      continue;
    }

    const previousPartnerId = pa.partner_id ? [pa.partner_id] : undefined;
    const nextPartner = await getRandomPartner(category, previousPartnerId);

    if (!nextPartner) {
      serverLogger.info('재배정 스킵: 배정 가능한 다른 업체 없음(미배정 유지)', {
        serviceRequestId: pa.service_request_id,
        category,
      });
      continue;
    }

    try {
      await assignPartnerWithClient(supabase, pa.service_request_id, nextPartner.id, ASSIGNED_BY_CRON);
      reassigned++;
      serverLogger.info('2시간 미열람 자동 재배정 완료', {
        serviceRequestId: pa.service_request_id,
        newPartnerId: nextPartner.id,
        newPartnerName: nextPartner.business_name,
      });
    } catch (assignErr) {
      serverLogger.error('자동 재배정 실패(미배정 상태 유지)', {
        serviceRequestId: pa.service_request_id,
        error: assignErr instanceof Error ? assignErr.message : assignErr,
      });
    }
  }

  return NextResponse.json({ success: true, processed, reassigned });
}
