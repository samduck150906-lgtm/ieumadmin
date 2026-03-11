import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifySession } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';
import { addCorsHeaders, createCorsPreflightResponse } from '@/lib/api/cors';

export const dynamic = 'force-dynamic';

/** OPTIONS preflight — dashboard-app 등 CORS 요청 대응 */
export async function OPTIONS(request: Request) {
  return createCorsPreflightResponse(request);
}

/**
 * 현재 로그인 사용자의 DB role 검증 API
 * - dashboard-app에서 Bearer 토큰으로 호출 (CORS 허용)
 * - 관리자 계정이 잘못 realtor/partner로 저장된 경우 감지
 */
async function getHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  const { data: userRow, error: userError } = await supabase
    .from('users')
    .select('id, email, name, role')
    .eq('id', session.userId)
    .single();

  if (userError || !userRow) {
    return NextResponse.json(
      { error: '사용자 정보를 조회할 수 없습니다.', code: userError?.code },
      { status: 404 }
    );
  }

  const { data: staffRow } = await supabase
    .from('staff')
    .select('id, is_admin, can_approve_settlement')
    .eq('user_id', session.userId)
    .single();

  let roleMismatch: string | null = null;

  // staff 테이블에 등록되어 있는데 users.role이 realtor/partner인 경우 → 관리자 계정이 잘못 저장됨
  if (staffRow && (userRow.role === 'realtor' || userRow.role === 'partner')) {
    roleMismatch =
      '관리자 계정이 DB에서 realtor/partner로 등록되어 있습니다. ' +
      'users 테이블의 role을 admin 또는 staff로 수정해 주세요. (Supabase 대시보드 또는 sync_auth_user_to_public.sql 사용)';
  }

  const body = {
    userId: userRow.id,
    email: userRow.email,
    name: userRow.name,
    role: userRow.role,
    inStaffTable: !!staffRow,
    staffIsAdmin: staffRow?.is_admin ?? false,
    roleMismatch,
    expectedRedirect:
      userRow.role === 'admin'
        ? '/admin'
        : userRow.role === 'staff'
          ? '/dashboard'
          : userRow.role === 'partner'
            ? '/partner/dashboard'
            : userRow.role === 'realtor'
              ? '/agent'
              : null,
  };
  const res = NextResponse.json(body);
  addCorsHeaders(res, request);
  return res;
}

async function getHandlerWithCors(request: NextRequest) {
  const result = await getHandler(request);
  if (result.status >= 400) {
    addCorsHeaders(result, request);
  }
  return result;
}

export const GET = withErrorHandler((request: Request) =>
  getHandlerWithCors(request as NextRequest)
);
