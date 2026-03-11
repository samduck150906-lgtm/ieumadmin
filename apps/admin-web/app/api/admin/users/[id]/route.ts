import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { updateUserStatus, isValidUserStatus } from '@/lib/user-service';
import { logAudit } from '@/lib/audit-log';
import { withErrorHandler } from '@/lib/api/error-handler';

/** Admin 회원 상세: staff + user by user id */
async function getHandler(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminSession(_request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const { id: userId } = await params;

  const { data: staffRow, error } = await supabase
    .from('staff')
    .select(
      `
      id,
      user_id,
      department,
      position,
      is_admin,
      can_approve_settlement,
      created_at,
      user:users!staff_user_id_fkey (
        id,
        email,
        name,
        phone,
        status,
        created_at,
        updated_at
      )
    `
    )
    .eq('user_id', userId)
    .single();

  if (error || !staffRow) {
    return NextResponse.json({ error: '회원을 찾을 수 없습니다.' }, { status: 404 });
  }

  type UserRow = { id: string; email: string | null; name: string | null; phone: string | null; status: string; created_at: string; updated_at: string } | { id: string; email: string | null; name: string | null; phone: string | null; status: string; created_at: string; updated_at: string }[];
  const uRaw = (staffRow as { user?: UserRow }).user;
  const u = Array.isArray(uRaw) ? uRaw[0] : uRaw;
  const role = staffRow.is_admin ? 'admin' : staffRow.can_approve_settlement ? 'manager' : 'viewer';

  // auth.users에서 last_sign_in_at 조회 (staff는 고객/파트너 초대·수수료 없음)
  let lastSignInAt: string | null = u?.updated_at ?? staffRow.created_at;
  try {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    if (authUser?.user?.last_sign_in_at) {
      lastSignInAt = authUser.user.last_sign_in_at;
    }
  } catch {
    // auth 조회 실패 시 기존 updated_at 유지
  }

  const user = {
    id: u?.id ?? staffRow.user_id,
    email: u?.email ?? '',
    name: u?.name ?? '',
    phone: u?.phone ?? '',
    role,
    status: u?.status ?? 'active',
    provider: 'email' as const,
    lastLoginAt: lastSignInAt,
    last_sign_in_at: lastSignInAt,
    createdAt: u?.created_at ?? staffRow.created_at,
    updatedAt: u?.updated_at ?? staffRow.created_at,
    invitedCustomers: 0,
    invitedPartners: 0,
    totalCommission: 0,
    recentActivity: [] as { id: string; action: string; targetType: string; targetId: string; createdAt: string }[],
  };

  return NextResponse.json(user);
}

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => getHandler(req as NextRequest, context))(request);

/** 회원(스태프) 상태 업데이트 — users 테이블의 status 변경 */
async function patchHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const { id: userId } = await params;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const status = body.status;
  if (!status || !isValidUserStatus(status)) {
    return NextResponse.json(
      { error: 'status는 active, suspended, terminated 중 하나여야 합니다.' },
      { status: 400 }
    );
  }

  const { data: staffRow, error: fetchError } = await supabase
    .from('staff')
    .select('user_id, user:users!staff_user_id_fkey (id, status)')
    .eq('user_id', userId)
    .single();

  if (fetchError || !staffRow?.user_id) {
    return NextResponse.json(
      { error: fetchError?.message ?? '회원을 찾을 수 없습니다.' },
      { status: fetchError?.code === 'PGRST116' ? 404 : 500 }
    );
  }

  type UserRow = { id?: string; status?: string } | { id?: string; status?: string }[] | null;
  const uRaw = (staffRow as { user?: UserRow }).user;
  const u = Array.isArray(uRaw) ? uRaw?.[0] : uRaw;
  const fromStatus = u?.status ?? 'unknown';

  const result = await updateUserStatus(supabase, userId, status);
  if (!result.success) {
    return NextResponse.json({ error: result.error ?? '상태 변경에 실패했습니다.' }, { status: 500 });
  }

  await logAudit(supabase, {
    actor_type: 'staff',
    actor_id: session.userId,
    action: '회원 상태 변경',
    resource_type: 'user',
    resource_id: userId,
    details: {
      user_id: userId,
      from_status: fromStatus,
      to_status: status,
    },
  });

  const { data: refetch, error: refetchError } = await supabase
    .from('staff')
    .select(
      `
      id, user_id, department, position, is_admin, can_approve_settlement, created_at,
      user:users!staff_user_id_fkey (id, email, name, phone, status, created_at, updated_at)
    `
    )
    .eq('user_id', userId)
    .single();

  if (refetchError || !refetch) {
    return NextResponse.json({ id: userId, status });
  }

  const uRefetch = Array.isArray((refetch as { user?: UserRow }).user)
    ? (refetch as { user?: UserRow[] }).user?.[0]
    : (refetch as { user?: UserRow }).user;
  const uData = Array.isArray(uRefetch) ? uRefetch[0] : uRefetch;

  return NextResponse.json({
    id: uData?.id ?? userId,
    status: uData?.status ?? status,
  });
}

export const PATCH = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => patchHandler(req as NextRequest, context))(request);
