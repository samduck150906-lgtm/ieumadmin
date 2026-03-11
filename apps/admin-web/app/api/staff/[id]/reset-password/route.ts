import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminSession(request);
  if (!session) return unauthorizedResponse();

  try {
    const { id: staffId } = await context.params;
    const body = await request.json();
    const { newPassword } = body as { newPassword?: string };
    const password = (newPassword || body.tempPassword || '').trim();
    if (!password) {
      return NextResponse.json({ success: false, error: '새 비밀번호를 입력해주세요.' }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: '서버 설정 오류. SUPABASE_SERVICE_ROLE_KEY를 확인하세요.' }, { status: 500 });
    }

    const { data: staff, error: staffErr } = await supabase
      .from('staff')
      .select('user_id')
      .eq('id', staffId)
      .single();

    if (staffErr || !staff?.user_id) {
      return NextResponse.json({ success: false, error: '직원을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { error: updateErr } = await supabase.auth.admin.updateUserById(staff.user_id, { password });

    if (updateErr) {
      return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '비밀번호가 초기화되었습니다.' });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '초기화 중 오류' },
      { status: 500 }
    );
  }
}

export const POST = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => postHandler(req as NextRequest, context))(request);
