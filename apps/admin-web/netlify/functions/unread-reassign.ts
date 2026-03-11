/**
 * Netlify Scheduled Function: 2시간 미열람 자동 재배정
 * - partner_assignments.status = 'unread' 이고 created_at이 2시간 전 이전인 건
 * - 배정 해제 후 다른 업체에 자동 랜덤 재배정 (동일 카테고리, 직전 업체 제외)
 * - 재배정 제한: reassign_count < max_reassign_count (3회)
 * - 매일 새벽 2시(KST) = 17:00 UTC 실행
 */
import type { Handler, HandlerEvent, HandlerContext, Config } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { assignPartnerWithClient } from '../../lib/api/requests';
import { getRandomPartner } from '../../lib/api/partners';
import { notifyCronFailure } from '../../lib/cron-notify';
import type { ServiceCategory } from '../../types/database';

const JOB_NAME = 'unread-reassign';
const UNREAD_THRESHOLD_HOURS = 2;
const MAX_REASSIGN_COUNT = 3;
const ASSIGNED_BY_CRON = 'cron:unread-reassign';

function createSupabaseClient(): SupabaseClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

  if (!url || !serviceKey) {
    console.error('[unread-reassign] Supabase 환경변수 미설정');
    return null;
  }

  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

async function runUnreadReassign(): Promise<{ processed: number; reassigned: number }> {
  const supabase = createSupabaseClient();
  if (!supabase) {
    throw new Error('Supabase 미설정');
  }

  const threshold = new Date(
    Date.now() - UNREAD_THRESHOLD_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data: unreadAssignments, error: fetchErr } = await supabase
    .from('partner_assignments')
    .select('id, service_request_id, partner_id')
    .eq('status', 'unread')
    .lt('created_at', threshold);

  if (fetchErr) {
    throw new Error(`미열람 배정 조회 오류: ${fetchErr.message}`);
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
      console.log(
        `[unread-reassign] 재배정 한도 초과로 스킵: sr=${pa.service_request_id}, count=${reassignCount}`
      );
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
      console.error('[unread-reassign] 배정 취소 오류:', pa.id, updatePaErr);
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
      console.error(
        '[unread-reassign] 서비스 요청 배정 해제 오류:',
        pa.service_request_id,
        updateSrErr
      );
      continue;
    }

    processed++;

    const category = sr?.category as ServiceCategory | undefined;
    if (!category) {
      console.warn(
        `[unread-reassign] 재배정 스킵: 카테고리 없음 sr=${pa.service_request_id}`
      );
      continue;
    }

    const previousPartnerId = pa.partner_id ? [pa.partner_id] : undefined;
    const nextPartner = await getRandomPartner(
      category,
      previousPartnerId,
      supabase
    );

    if (!nextPartner) {
      console.log(
        `[unread-reassign] 재배정 스킵: 배정 가능한 다른 업체 없음 sr=${pa.service_request_id}, category=${category}`
      );
      continue;
    }

    try {
      await assignPartnerWithClient(
        supabase,
        pa.service_request_id,
        nextPartner.id,
        ASSIGNED_BY_CRON
      );
      reassigned++;
      console.log(
        `[unread-reassign] 2시간 미열람 자동 재배정 완료: sr=${pa.service_request_id}, newPartner=${nextPartner.business_name}`
      );
    } catch (assignErr) {
      console.error(
        '[unread-reassign] 자동 재배정 실패:',
        pa.service_request_id,
        assignErr
      );
    }
  }

  return { processed, reassigned };
}

const handler: Handler = async (
  _event: HandlerEvent,
  _context: HandlerContext
) => {
  try {
    const result = await runUnreadReassign();
    console.log(
      `[unread-reassign] 완료: processed=${result.processed}, reassigned=${result.reassigned}`
    );
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (e) {
    await notifyCronFailure(JOB_NAME, e);
    throw e;
  }
};

// 매일 새벽 2시(KST) = 17:00 UTC 실행
export const config: Config = {
  schedule: '0 17 * * *',
};

export default handler;
