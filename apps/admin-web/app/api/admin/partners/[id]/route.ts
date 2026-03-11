import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { logAudit } from '@/lib/audit-log';
import { updateUserStatus } from '@/lib/user-service';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const patchPartnerSchema = z.object({
  status: z.enum(['active', 'suspended', 'terminated'], {
    message: 'status는 active, suspended, terminated 중 하나여야 합니다.',
  }),
});

import type { Partner } from '@/types/partner';

export const dynamic = 'force-dynamic';

type UserRow = { email: string | null; status: string } | { email: string | null; status: string }[] | null;

function mapRowToPartner(row: {
  id: string;
  user_id: string;
  business_name: string | null;
  representative_name: string | null;
  business_number: string | null;
  address: string | null;
  contact_phone: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  created_at: string;
  updated_at: string;
  user?: UserRow;
}): Partner {
  const user = Array.isArray(row.user) ? row.user[0] : row.user;
  const status = (user?.status === 'active' ? 'active' : user?.status === 'suspended' ? 'suspended' : user?.status === 'terminated' ? 'terminated' : 'pending_verification') as Partner['status'];
  return {
    id: row.id,
    userId: row.user_id,
    companyName: row.business_name ?? '',
    representativeName: row.representative_name ?? row.manager_name ?? '',
    businessNumber: row.business_number ?? '',
    licenseNumber: '',
    address: row.address ?? '',
    phone: row.contact_phone ?? row.manager_phone ?? '',
    email: user?.email ?? '',
    tier: 'bronze',
    status,
    totalSettlement: 0,
    pendingSettlement: 0,
    customerCount: 0,
    joinedAt: row.created_at,
    verifiedAt: undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bankInfo: undefined,
  };
}

async function getHandler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminSession(_request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });

  const { id } = await context.params;

  const { data: row, error } = await supabase
    .from('partners')
    .select(
      `
      id, user_id, business_name, representative_name, business_number, address,
      contact_phone, manager_name, manager_phone, created_at, updated_at,
      user:users!partners_user_id_fkey (email, status)
    `
    )
    .eq('id', id)
    .single();

  if (error || !row) {
    return NextResponse.json({ error: error?.message ?? 'Not found' }, { status: error?.code === 'PGRST116' ? 404 : 500 });
  }

  const partner = mapRowToPartner(row as Parameters<typeof mapRowToPartner>[0]);
  return NextResponse.json(partner);
}

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => getHandler(req as NextRequest, context))(request);

/** 파트너 상태 업데이트 — users 테이블의 status 변경 */
async function patchHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifyAdminSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) throw new ApiError('서버 설정 오류', 500);

  const { id } = await context.params;
  const parsed = await parseBody(request, patchPartnerSchema);
  if (!parsed.ok) return parsed.response;
  const { status } = parsed.data;

  const { data: row, error: fetchError } = await supabase
    .from('partners')
    .select('id, user_id, business_name, user:users!partners_user_id_fkey (status)')
    .eq('id', id)
    .single();

  if (fetchError || !row?.user_id) {
    throw new ApiError(
      fetchError?.message ?? '파트너를 찾을 수 없습니다.',
      fetchError?.code === 'PGRST116' ? 404 : 500
    );
  }

  const userRow = Array.isArray((row as { user?: { status?: string } }).user)
    ? (row as { user?: { status?: string }[] }).user?.[0]
    : (row as { user?: { status?: string } }).user;
  const fromStatus = userRow?.status ?? 'unknown';

  const result = await updateUserStatus(supabase, row.user_id, status);
  if (!result.success) {
    throw new ApiError(result.error ?? '상태 변경에 실패했습니다.', 500);
  }

  await logAudit(supabase, {
    actor_type: 'staff',
    actor_id: session.userId,
    action: '사용자 상태 변경(해지/정지)',
    resource_type: 'user',
    resource_id: row.user_id,
    details: {
      partner_id: id,
      user_id: row.user_id,
      company_name: (row as { business_name?: string }).business_name ?? null,
      from_status: fromStatus,
      to_status: status,
    },
  });

  const { data: updatedRow, error: refetchError } = await supabase
    .from('partners')
    .select(
      `
      id, user_id, business_name, representative_name, business_number, address,
      contact_phone, manager_name, manager_phone, created_at, updated_at,
      user:users!partners_user_id_fkey (email, status)
    `
    )
    .eq('id', id)
    .single();

  if (refetchError || !updatedRow) {
    return NextResponse.json({ success: true, message: '상태가 변경되었습니다.' });
  }

  const partner = mapRowToPartner(updatedRow as Parameters<typeof mapRowToPartner>[0]);
  return NextResponse.json(partner);
}

export const PATCH = async (
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => patchHandler(req as NextRequest, context))(request);
