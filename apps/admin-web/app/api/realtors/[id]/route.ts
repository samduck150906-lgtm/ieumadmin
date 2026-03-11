import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 공인중개사 상세 조회 (모든 정보 열람). staff/admin만 호출 가능 */
async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: realtorId } = await context.params;
  if (!realtorId) {
    return NextResponse.json({ error: 'realtor id 필요' }, { status: 400 });
  }

  const session = await verifyStaffSession(_request);
  if (!session) {
    return unauthorizedResponse();
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('realtors')
    .select(
      `
      *,
      user:users!realtors_user_id_fkey (*)
    `
    )
    .eq('id', realtorId)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? '해당 공인중개사를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  const row = data as Record<string, unknown> & { referrer_id?: string | null };
  let referrer: { id: string; business_name: string; contact_name: string | null; contact_phone: string | null } | null = null;
  if (row.referrer_id) {
    const { data: ref } = await supabase
      .from('realtors')
      .select('id, business_name, contact_name, contact_phone')
      .eq('id', row.referrer_id)
      .single();
    if (ref) referrer = ref;
  }

  return NextResponse.json({ ...row, referrer });
}

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => getHandler(req as NextRequest, context))(request);
