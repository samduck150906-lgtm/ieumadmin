import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

/** Admin user list from staff + users tables */
async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase client init failed' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(100, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)));
  const search = searchParams.get('search')?.toLowerCase().trim() ?? '';
  const status = searchParams.get('status'); // active | inactive | suspended | terminated
  const role = searchParams.get('role'); // admin | manager | viewer

  // staff + users (role = staff | admin)
  let query = supabase
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
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  const { data: staffRows, error: staffError } = await query;

  if (staffError) {
    console.error('admin users list error', staffError);
    return NextResponse.json({ error: staffError.message }, { status: 500 });
  }

  type UserInfo = {
    id: string;
    email: string | null;
    name: string | null;
    phone: string | null;
    status: string;
    created_at: string;
    updated_at: string;
  };
  type StaffRow = {
    id: string;
    user_id: string;
    department: string | null;
    position: string | null;
    is_admin: boolean | null;
    can_approve_settlement: boolean | null;
    created_at: string;
    user?: UserInfo | UserInfo[] | null;
  };

  const mapToRole = (s: StaffRow): 'admin' | 'manager' | 'viewer' => {
    if (s.is_admin) return 'admin';
    if (s.can_approve_settlement) return 'manager';
    return 'viewer';
  };

  const getUser = (s: StaffRow): UserInfo | null => Array.isArray(s.user) ? s.user[0] ?? null : s.user ?? null;

  let list = (staffRows ?? []).map((s: StaffRow) => {
    const u = getUser(s);
    return {
      id: u?.id ?? s.user_id,
      email: u?.email ?? '',
      name: u?.name ?? '',
      phone: u?.phone ?? '',
      role: mapToRole(s),
      status: u?.status ?? 'active',
      provider: 'email' as const,
      lastLoginAt: u?.updated_at ?? s.created_at,
      createdAt: u?.created_at ?? s.created_at,
      updatedAt: u?.updated_at ?? s.created_at,
    };
  });

  if (search) {
    list = list.filter(
      (u) =>
        u.name.toLowerCase().includes(search) ||
        (u.email && u.email.toLowerCase().includes(search)) ||
        (u.phone && u.phone.includes(search))
    );
  }
  if (status) {
    list = list.filter((u) => u.status === status);
  }
  if (role) {
    list = list.filter((u) => u.role === role);
  }

  const total = list.length;
  const start = (page - 1) * limit;
  const data = list.slice(start, start + limit);

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
