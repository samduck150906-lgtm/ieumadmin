import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit-log';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 출금 완료 처리 — 관리자 또는 정산 담당자만 허용. 수수료 정산(commissions) 반영 */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  if (!session.isAdmin && !session.canApproveSettlement) {
    return forbiddenResponse('출금 완료 처리 권한이 없습니다. 정산 담당자만 처리할 수 있습니다.');
  }

  let body: { id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }
  const id = body?.id;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const { data: result, error: rpcError } = await supabase.rpc('complete_withdrawal', {
    p_withdrawal_id: id,
    p_processed_by: session.userId,
  });

  if (rpcError) {
    return NextResponse.json({ error: rpcError.message }, { status: 500 });
  }

  const payload = result as { success?: boolean; error?: string; amount?: number } | null;
  if (!payload?.success) {
    const msg = payload?.error ?? '출금 완료 처리에 실패했습니다.';
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const { data: row } = await supabase
    .from('withdrawal_requests')
    .select('amount, realtor_id')
    .eq('id', id)
    .single();
  await logAudit(supabase, {
    actor_type: 'staff',
    actor_id: session.userId,
    action: 'withdrawal.completed',
    resource_type: 'withdrawal_request',
    resource_id: id,
    details: { amount: row?.amount ?? payload?.amount ?? null, realtor_id: row?.realtor_id ?? null },
  });

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
