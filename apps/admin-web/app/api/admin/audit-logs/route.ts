import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 감사 로그 목록 — staff만 조회 가능 (RLS: is_staff) */
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
  const action = searchParams.get('action')?.trim();
  const actorType = searchParams.get('actor_type')?.trim();

  let query = supabase
    .from('audit_logs')
    .select('id, created_at, actor_type, actor_id, action, resource_type, resource_id, details', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (action) {
    query = query.ilike('action', `%${action}%`);
  }
  if (actorType) {
    query = query.eq('actor_type', actorType);
  }

  const from = (page - 1) * limit;
  const to = from + limit - 1;
  const { data: rows, error, count } = await query.range(from, to);

  if (error) {
    console.error('audit-logs list error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;

  return NextResponse.json({
    data: (rows ?? []).map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      actorType: r.actor_type,
      actorId: r.actor_id,
      action: r.action,
      resourceType: r.resource_type,
      resourceId: r.resource_id,
      details: r.details,
    })),
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
