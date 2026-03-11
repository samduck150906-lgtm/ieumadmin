import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const bulkStatusSchema = z.object({
  realtorIds: z.array(z.string().min(1)).min(1, 'realtorIds 배열이 필요합니다'),
  status: z.enum(['active', 'inactive', 'suspended', 'terminated'], {
    message: 'status는 active, inactive, suspended, terminated 중 하나여야 합니다',
  }),
});

/** 공인중개사 일괄 상태변경. staff/admin만 호출 가능. */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    throw new ApiError('서버 설정 오류', 500);
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const parsed = await parseBody(request, bulkStatusSchema);
  if (!parsed.ok) return parsed.response;
  const { realtorIds, status } = parsed.data;

  const validIds = realtorIds.filter((id) => id.length > 0);
  if (validIds.length === 0) {
    throw new ApiError('유효한 공인중개사 ID가 없습니다', 400);
  }

  const { data: rows, error: fetchError } = await supabase
    .from('realtors')
    .select('id, user_id')
    .in('id', validIds);

  if (fetchError) {
    throw new ApiError(fetchError.message, 500);
  }

  const userIds = (rows ?? []).map((r) => r.user_id).filter(Boolean) as string[];
  if (userIds.length === 0) {
    throw new ApiError('대상 공인중개사의 user_id를 찾을 수 없습니다', 400);
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .in('id', userIds);

  if (updateError) {
    throw new ApiError(updateError.message, 500);
  }

  return NextResponse.json({
    success: true,
    updated: userIds.length,
    status,
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
