import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 문의 목록 조회 (inquiries 테이블) */
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
  const status = searchParams.get('status') ?? '';
  const search = searchParams.get('search')?.trim() ?? '';

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase
    .from('inquiries')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (status) {
    query = query.eq('status', status);
  }

  if (search) {
    const sanitized = search.replace(/[%_\\]/g, '');
    if (sanitized) {
      query = query.or(
        `name.ilike.%${sanitized}%,email.ilike.%${sanitized}%,phone.ilike.%${sanitized}%,subject.ilike.%${sanitized}%,content.ilike.%${sanitized}%`
      );
    }
  }

  const { data, error, count } = await query;

  if (error) {
    console.error('admin inquiries list error', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const total = count ?? 0;

  return NextResponse.json({
    data: data ?? [],
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
