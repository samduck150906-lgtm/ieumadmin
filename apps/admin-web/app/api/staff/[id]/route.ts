import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const patchStaffSchema = z.object({
  status: z.enum(['active', 'inactive'], { message: 'status는 active 또는 inactive 여야 합니다.' }),
});

async function patchHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const { id: staffId } = await context.params;
  const parsed = await parseBody(request, patchStaffSchema);
  if (!parsed.ok) return parsed.response;
  const { status } = parsed.data;

  const supabase = createServerClient();
  if (!supabase) {
    throw new ApiError('서버 설정 오류. SUPABASE_SERVICE_ROLE_KEY를 확인하세요.', 500);
  }

  const { data: staff, error: staffErr } = await supabase
    .from('staff')
    .select('user_id')
    .eq('id', staffId)
    .single();

  if (staffErr || !staff?.user_id) {
    throw new ApiError('직원을 찾을 수 없습니다.', 404);
  }

  const { error: userErr } = await supabase
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', staff.user_id);

  if (userErr) {
    throw new ApiError(userErr.message, 500);
  }

  return NextResponse.json({ success: true, message: status === 'inactive' ? '비활성화되었습니다.' : '활성화되었습니다.' });
}

export const PATCH = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => patchHandler(req as NextRequest, context))(request);
