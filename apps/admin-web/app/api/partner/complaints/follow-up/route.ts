/**
 * 파트너 민원 후속조치 API
 * - 로그인한 파트너가 자신에게 배정된 complaint_logs만 상태 변경 및 후속조치 기록 가능
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { parseBody } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';

const followUpSchema = z.object({
  id: z.string().uuid('민원 ID가 필요합니다'),
  status: z.enum(['pending', 'processing', 'resolved']),
  follow_up_memo: z.string().optional().transform((s) => (s ?? '').trim()),
});

async function postHandler(request: NextRequest) {
  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  if (!partnerId) return unauthorizedResponse('인증 필요');

  const parsed = await parseBody(request, followUpSchema);
  if (!parsed.ok) return parsed.response;

  const { id, status, follow_up_memo } = parsed.data;

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const { data: log, error: fetchErr } = await supabase
    .from('complaint_logs')
    .select('id, partner_id, follow_up_at')
    .eq('id', id)
    .single();

  if (fetchErr || !log) {
    return NextResponse.json({ error: '민원을 찾을 수 없습니다.' }, { status: 404 });
  }

  if (log.partner_id !== partnerId) {
    return NextResponse.json({ error: '해당 민원에 대한 권한이 없습니다.' }, { status: 403 });
  }

  const now = new Date().toISOString();
  const updatePayload: Record<string, unknown> = {
    status,
    updated_at: now,
  };

  if (follow_up_memo) {
    updatePayload.follow_up_memo = follow_up_memo;
    updatePayload.follow_up_at = now;
    updatePayload.follow_up_by = session.userId;
  }

  const { error: updateErr } = await supabase
    .from('complaint_logs')
    .update(updatePayload)
    .eq('id', id);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
