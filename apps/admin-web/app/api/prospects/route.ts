import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 가망고객 목록 조회 (공인중개사 전용) */
async function getHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);
  const cursor = searchParams.get('cursor') || undefined;

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }
    let query = supabase
      .from('realtor_prospects')
      .select('*')
      .eq('realtor_id', session.realtorId)
      .order('created_at', { ascending: false })
      .limit(limit + 1);

    if (category && category !== 'all') {
      query = query.eq('category', category);
    }
    if (cursor) {
      query = query.lt('created_at', cursor);
    }

    const { data, error } = await query;
    if (error) throw error;
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const result = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && result.length > 0 ? (result[result.length - 1] as { created_at?: string }).created_at : null;
    return NextResponse.json({ data: result, nextCursor, hasMore });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));

/** 가망고객 단건 등록 */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const body = await request.json().catch(() => ({}));
  const { category, name, phone, email, memo } = body as {
    category?: string;
    name?: string;
    phone?: string;
    email?: string;
    memo?: string;
  };

  const phoneTrim = String(phone ?? '').replace(/\s/g, '').replace(/-/g, '');
  if (!name?.trim()) {
    return NextResponse.json({ error: '이름을 입력해 주세요.' }, { status: 400 });
  }
  if (!phoneTrim || phoneTrim.length < 10) {
    return NextResponse.json({ error: '올바른 휴대번호를 입력해 주세요.' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }
    const { data, error } = await supabase
      .from('realtor_prospects')
      .insert({
        realtor_id: session.realtorId,
        category: (category || '일반').trim(),
        name: name.trim(),
        phone: phoneTrim,
        email: email?.trim() || null,
        memo: memo?.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ success: true, data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '등록 실패' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
