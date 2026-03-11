import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const STAFF_ROLES = ['admin', 'sub_admin', 'accounting', 'cs'] as const;

const createStaffSchema = z.object({
  name: z.string().optional(),
  email: z.string().min(1, '이메일은 필수입니다.').transform((s) => s.trim()),
  tempPassword: z.string().min(1, '임시 비밀번호는 필수입니다.'),
  department: z.string().optional(),
  position: z.string().optional(),
  is_admin: z.boolean().optional(),
  can_approve_settlement: z.boolean().optional(),
  staff_role: z.enum(STAFF_ROLES).optional(),
});

async function postHandler(request: NextRequest) {
  const session = await verifyAdminSession(request);
  if (!session) return unauthorizedResponse();

  const parsed = await parseBody(request, createStaffSchema);
  if (!parsed.ok) return parsed.response;
  const { name, email, tempPassword, department, position, is_admin, can_approve_settlement, staff_role } = parsed.data;

  const role = staff_role ?? (is_admin ? 'admin' : can_approve_settlement ? 'accounting' : 'cs');
  const derivedIsAdmin = role === 'admin';
  const derivedCanApprove = role === 'admin' || role === 'accounting';

  const supabase = createServerClient();
  if (!supabase) {
    throw new ApiError('서버 설정 오류. SUPABASE_SERVICE_ROLE_KEY를 확인하세요.', 500);
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      role: 'staff',
      terms_agreed: 'true',
    },
  });

  if (authError) {
    const msg =
      authError.message?.includes('already been registered') ||
      authError.message?.includes('already exists')
        ? '이미 가입된 이메일입니다.'
        : /invalid api key|invalid api_key/i.test(authError.message ?? '')
          ? '서버 설정 오류입니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.'
          : authError.message || '계정 생성에 실패했습니다.';
    throw new ApiError(msg, 400);
  }

  const userId = authData.user.id;

  // 트리거(on_auth_user_created)가 realtor로 먼저 넣을 수 있으므로 upsert
  const { error: userErr } = await supabase.from('users').upsert(
    {
      id: userId,
      email,
      name: (name ?? '').trim() || null,
      role: 'staff',
      status: 'active',
    },
    { onConflict: 'id' }
  );

  if (userErr) {
    throw new ApiError(`users 저장 실패: ${userErr.message}`, 500);
  }

  // staff는 realtor가 아니므로 트리거로 생성된 realtors 행 제거
  await supabase.from('realtors').delete().eq('user_id', userId);

  const { error: staffErr } = await supabase.from('staff').insert({
    user_id: userId,
    department: (department || '').trim() || null,
    position: (position || '').trim() || null,
    is_admin: derivedIsAdmin,
    can_approve_settlement: derivedCanApprove,
    staff_role: role,
  });

  if (staffErr) {
    throw new ApiError(`staff 저장 실패: ${staffErr.message}`, 500);
  }

  return NextResponse.json({ success: true, message: '직원이 등록되었습니다.' });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
