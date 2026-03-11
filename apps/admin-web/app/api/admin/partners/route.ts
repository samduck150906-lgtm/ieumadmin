import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';
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
  const status = (user?.status === 'active' ? 'active' : user?.status === 'suspended' ? 'suspended' : 'pending_verification') as Partner['status'];
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
  };
}

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: 'Supabase client init failed' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)));
  const status = searchParams.get('status');
  const search = searchParams.get('search')?.trim();

  let query = supabase
    .from('partners')
    .select(
      `
      id, user_id, business_name, representative_name, business_number, address,
      contact_phone, manager_name, manager_phone, created_at, updated_at,
      user:users!partners_user_id_fkey (email, status)
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  if (status && status !== 'all') {
    const { data: userIds } = await supabase.from('users').select('id').eq('status', status);
    const ids = (userIds ?? []).map((u: { id: string }) => u.id);
    if (ids.length === 0) {
      return NextResponse.json({
        data: [],
        meta: { total: 0, page, limit, totalPages: 0, hasNext: false, hasPrev: false },
      });
    }
    query = query.in('user_id', ids);
  }
  if (search) {
    const term = `%${search}%`;
    query = query.or(`business_name.ilike.${term},manager_name.ilike.${term},manager_phone.ilike.${term}`);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, error, count } = await query.range(from, to);

  if (error) {
    console.error('admin partners list error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;
  const data = (rows ?? []).map(mapRowToPartner);

  return NextResponse.json({
    data,
    meta: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
