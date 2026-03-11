import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const bulkStatusSchema = z.object({
  partnerIds: z.array(z.string().min(1)).min(1, 'partnerIds가 필요합니다'),
  status: z.enum(['active', 'inactive'], {
    message: 'status는 active 또는 inactive 여야 합니다.',
  }),
});

export const dynamic = 'force-dynamic';

/** 제휴업체 일괄 상태변경 — 선택한 제휴업체의 연동 users.status 를 active | inactive 로 변경 */
async function postHandler(request: NextRequest) {
  const session = await verifyAdminSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) throw new ApiError('서버 설정 오류', 500);

  const parsed = await parseBody(request, bulkStatusSchema);
  if (!parsed.ok) return parsed.response;
  const { partnerIds, status } = parsed.data;

  const { data: rows, error: fetchError } = await supabase
    .from('partners')
    .select('id, user_id')
    .in('id', partnerIds);

  if (fetchError) {
    throw new ApiError(fetchError.message, 500);
  }

  const userIds = (rows ?? []).map((r: { user_id: string }) => r.user_id).filter(Boolean);
  if (userIds.length === 0) {
    return NextResponse.json({ success: true, updated: 0, failed: partnerIds.length });
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ status })
    .in('id', userIds);

  if (updateError) {
    throw new ApiError(updateError.message, 500);
  }

  return NextResponse.json({ success: true, updated: userIds.length, failed: partnerIds.length - userIds.length });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
