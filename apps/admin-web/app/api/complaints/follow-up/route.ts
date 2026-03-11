/**
 * 고객 민원 관리 - 후속조치 기록 및 업체 불만횟수 누적
 * - 저평점: 리뷰 기준으로 complaint_logs 생성 후 후속조치 기록
 * - 불만: 기존 complaint_logs에 후속조치 기록
 * - 첫 후속조치 기록 시 해당 제휴업체 complaint_count +1
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession, verifyPartnerSession } from '@/lib/auth-middleware';
import { parseBody } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';

const staffFollowUpSchema = z.object({
  sourceType: z.enum(['low_rating', 'complaint']),
  id: z.string().min(1, 'id 필요'),
  service_request_id: z.string().uuid().optional(),
  follow_up_memo: z.string().min(1, 'follow_up_memo 필요').transform((s) => s.trim()),
  status: z.enum(['pending', 'processing', 'resolved']),
});

const partnerFollowUpSchema = z.object({
  id: z.string().uuid('민원 ID가 필요합니다'),
  status: z.enum(['pending', 'processing', 'resolved']),
  follow_up_memo: z.string().optional().transform((s) => (s ?? '').trim()),
});

async function postHandler(request: NextRequest) {
  const staffSession = await verifyStaffSession(request);
  const partnerSession = !staffSession ? await verifyPartnerSession(request) : null;

  if (!staffSession && !partnerSession) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  const isPartner = !!partnerSession;
  const session = staffSession ?? partnerSession!;

  const parsed = isPartner
    ? await parseBody(request, partnerFollowUpSchema)
    : await parseBody(request, staffFollowUpSchema);
  if (!parsed.ok) return parsed.response;

  const sourceType = isPartner ? 'complaint' : (parsed.data as z.infer<typeof staffFollowUpSchema>).sourceType;
  const id = parsed.data.id;
  const status = parsed.data.status;
  const follow_up_memo = parsed.data.follow_up_memo ?? '';
  const service_request_id = !isPartner ? (parsed.data as z.infer<typeof staffFollowUpSchema>).service_request_id : undefined;

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const now = new Date().toISOString();
  let logId: string;
  let partnerId: string | null = null;
  let hadFollowUpBefore = false;

  if (sourceType === 'low_rating') {
    const srId = service_request_id || id;
    if (!srId) return NextResponse.json({ error: '저평점 건은 service_request_id 필요' }, { status: 400 });

    const { data: review } = await supabase
      .from('reviews')
      .select('id, comment, service_request_id')
      .eq('id', id)
      .single();
    if (!review) return NextResponse.json({ error: '리뷰를 찾을 수 없습니다.' }, { status: 404 });

    const { data: sr } = await supabase
      .from('service_requests')
      .select('id, assigned_partner_id, customer_id')
      .eq('id', review.service_request_id)
      .single();
    if (!sr) return NextResponse.json({ error: '서비스 요청을 찾을 수 없습니다.' }, { status: 404 });

    partnerId = sr.assigned_partner_id;

    const { data: existing } = await supabase
      .from('complaint_logs')
      .select('id, follow_up_at')
      .eq('service_request_id', review.service_request_id)
      .eq('type', 'low_rating')
      .limit(1)
      .maybeSingle();

    if (existing) {
      logId = existing.id;
      hadFollowUpBefore = !!existing.follow_up_at;
      const { error: updateErr } = await supabase
        .from('complaint_logs')
        .update({
          follow_up_memo: follow_up_memo.trim(),
          follow_up_at: now,
          follow_up_by: session.userId,
          status,
        })
        .eq('id', logId);
      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    } else {
      const { data: inserted, error: insertErr } = await supabase
        .from('complaint_logs')
        .insert({
          service_request_id: review.service_request_id,
          partner_id: partnerId,
          customer_id: sr.customer_id,
          type: 'low_rating',
          content: review.comment || null,
          follow_up_memo: follow_up_memo.trim(),
          follow_up_at: now,
          follow_up_by: session.userId,
          status,
        })
        .select('id')
        .single();
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
      logId = inserted!.id;
    }
  } else {
    const { data: log, error: fetchErr } = await supabase
      .from('complaint_logs')
      .select('id, partner_id, follow_up_at')
      .eq('id', id)
      .single();
    if (fetchErr || !log) return NextResponse.json({ error: '민원 로그를 찾을 수 없습니다.' }, { status: 404 });
    if (isPartner && log.partner_id !== partnerSession!.partnerId) {
      return NextResponse.json({ error: '해당 민원에 대한 권한이 없습니다.' }, { status: 403 });
    }
    logId = log.id;
    partnerId = log.partner_id;
    hadFollowUpBefore = !!log.follow_up_at;

    const updatePayload: Record<string, unknown> = { status };
    if (follow_up_memo) {
      updatePayload.follow_up_memo = follow_up_memo.trim();
      updatePayload.follow_up_at = now;
      updatePayload.follow_up_by = session.userId;
    }

    const { error: updateErr } = await supabase
      .from('complaint_logs')
      .update(updatePayload)
      .eq('id', id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const didRecordFollowUp = sourceType === 'low_rating' || !!follow_up_memo;
  if (partnerId && !hadFollowUpBefore && didRecordFollowUp) {
    const { data: partner, error: partnerErr } = await supabase
      .from('partners')
      .select('complaint_count')
      .eq('id', partnerId)
      .single();
    if (!partnerErr && partner) {
      const nextCount = Math.max(0, (partner.complaint_count ?? 0) + 1);
      await supabase.from('partners').update({ complaint_count: nextCount }).eq('id', partnerId);
    }
  }

  return NextResponse.json({ success: true, logId });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
