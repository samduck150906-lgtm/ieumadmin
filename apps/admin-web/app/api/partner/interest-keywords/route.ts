/**
 * 제휴업체 관심 키워드 (지역/평수/날짜) 등록·조회
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

async function getHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  if (!partnerId) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  try {
    const { data } = await supabase
      .from('partner_interest_keywords')
      .select('*')
      .eq('partner_id', partnerId)
      .order('created_at', { ascending: false });
    return NextResponse.json({ data: data || [] });
  } catch {
    return NextResponse.json({ data: [] });
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));

async function postHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  if (!partnerId) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { category, region_keyword, area_size, moving_type, date_from, date_to } = body;

  if (!category) return NextResponse.json({ error: '카테고리 필요' }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from('partner_interest_keywords')
      .insert({
        partner_id: partnerId,
        category,
        region_keyword: region_keyword || null,
        area_size: area_size || null,
        moving_type: moving_type || null,
        date_from: date_from || null,
        date_to: date_to || null,
      })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ data });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '등록 실패' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));

async function deleteHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  if (!partnerId) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const id = request.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  const { error } = await supabase
    .from('partner_interest_keywords')
    .delete()
    .eq('id', id)
    .eq('partner_id', partnerId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

export const DELETE = withErrorHandler((request: Request) => deleteHandler(request as NextRequest));
