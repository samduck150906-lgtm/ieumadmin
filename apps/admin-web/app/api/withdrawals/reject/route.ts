import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase';
import { logAudit } from '@/lib/audit-log';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const rejectBodySchema = z.object({
  id: z.string().min(1, 'id가 필요합니다.'),
  reason: z.string().min(1, '반려 사유가 필요합니다.').transform((s) => s.trim()),
});

/** 출금 반려 — 관리자 또는 정산 담당자만 허용 */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  if (!session.isAdmin && !session.canApproveSettlement) {
    return forbiddenResponse('출금 반려 권한이 없습니다. 정산 담당자만 반려할 수 있습니다.');
  }

  const parsed = await parseBody(request, rejectBodySchema);
  if (!parsed.ok) return parsed.response;
  const { id, reason } = parsed.data;

  const supabase = createServerClient();
  if (!supabase) {
    throw new ApiError('서버 설정 오류', 500);
  }

  const { error } = await supabase
    .from('withdrawal_requests')
    .update({
      status: 'rejected',
      processed_by: session.userId,
      processed_at: new Date().toISOString(),
      reject_reason: String(reason).trim(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) {
    throw new ApiError(error.message, 500);
  }

  const { data: row } = await supabase
    .from('withdrawal_requests')
    .select('amount, realtor_id')
    .eq('id', id)
    .single();
  await logAudit(supabase, {
    actor_type: 'staff',
    actor_id: session.userId,
    action: 'withdrawal.rejected',
    resource_type: 'withdrawal_request',
    resource_id: id,
    details: {
      amount: row?.amount ?? null,
      realtor_id: row?.realtor_id ?? null,
      reject_reason: String(reason).trim(),
    },
  });

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
