/**
 * 공인중개사별 전용 폼메일 문구 목록 (관리자 전용)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim() || '';

  let query = supabase
    .from('realtors')
    .select('id, business_name, custom_invite_message')
    .order('business_name', { ascending: true });

  if (search) {
    query = query.or(`business_name.ilike.%${search}%,id.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ realtors: data ?? [] });
}

export const GET = withErrorHandler((req: Request) => getHandler(req as NextRequest));
