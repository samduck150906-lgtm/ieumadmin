import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';
import { logAudit } from '@/lib/audit-log';

const approveBodySchema = z.object({ id: z.string().uuid('유효한 출금 요청 ID가 필요합니다.') });

/** 출금 승인 — 관리자 또는 정산 담당자(can_approve_settlement)만 허용 */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  if (!session.isAdmin && !session.canApproveSettlement) {
    return forbiddenResponse('출금 승인 권한이 없습니다. 정산 담당자만 승인할 수 있습니다.');
  }

  const parsed = await parseBody(request, approveBodySchema);
  if (!parsed.ok) return parsed.response;
  const { id } = parsed.data;

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: '서버 설정 오류' }, { status: 500 });
  }

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'approved',
      processed_by: session.userId,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }

  const { data: row } = await supabase
    .from('withdrawal_requests')
    .select('amount, realtor_id')
    .eq('id', id)
    .single();
  await logAudit(supabase, {
    actor_type: 'staff',
    actor_id: session.userId,
    action: 'withdrawal.approved',
    resource_type: 'withdrawal_request',
    resource_id: id,
    details: { amount: row?.amount ?? null, realtor_id: row?.realtor_id ?? null },
  });

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
