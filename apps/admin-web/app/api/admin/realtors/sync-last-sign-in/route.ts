import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';

/**
 * auth.users.last_sign_in_at → users.last_sign_in_at 동기화
 * 크론(매일) 또는 관리자가 수동 실행. 2주 미활동 판단에 사용.
 */
async function postHandler(_request: NextRequest) {
  const session = await verifyStaffSession(_request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    throw new ApiError('서버 설정 오류', 500);
  }

  const { data: realtorRows } = await supabase.from('realtors').select('user_id');
  const userIds = [...new Set((realtorRows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];

  let synced = 0;
  for (const userId of userIds) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(userId);
      const lastSignIn = authUser?.user?.last_sign_in_at ?? null;
      const { error } = await supabase
        .from('users')
        .update({ last_sign_in_at: lastSignIn, updated_at: new Date().toISOString() })
        .eq('id', userId);
      if (!error) synced += 1;
    } catch {
      // 개별 실패 시 건너뛰기
    }
  }

  return NextResponse.json({ success: true, synced, total: userIds.length });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
