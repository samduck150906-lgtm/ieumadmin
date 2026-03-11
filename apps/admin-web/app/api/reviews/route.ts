import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyReviewToken } from '@/lib/review-token';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** GET: 리뷰 목록 (본사용 - 전체 / 파트너용 - 자사만) */
async function getHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const partnerId = searchParams.get('partner_id');
  const rating = searchParams.get('rating');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  let query = supabase
    .from('reviews')
    .select(`
      *,
      partner:partners!reviews_partner_id_fkey (id, business_name),
      customer:customers!reviews_customer_id_fkey (id, name, phone),
      service_request:service_requests!reviews_service_request_id_fkey (id, category)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (partnerId) {
    query = query.eq('partner_id', partnerId);
  }
  if (rating && ['satisfied', 'normal', 'unsatisfied'].includes(rating)) {
    query = query.eq('rating', rating);
  }

  const from = (page - 1) * limit;
  query = query.range(from, from + limit - 1);

  const { data, error, count } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    data: data || [],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  });
}

/** POST: 고객 리뷰 제출 (작업완료 시 고객에게 발송된 링크에서 호출) */
async function postHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { service_request_id, rating, comment, token } = body;

    if (!service_request_id || !rating) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 });
    }

    if (!['satisfied', 'normal', 'unsatisfied'].includes(rating)) {
      return NextResponse.json({ error: '올바른 평점을 선택해주세요.' }, { status: 400 });
    }

    // 후기 요청 토큰 검증 (위조/무단 제출 방지)
    if (!token) {
      return NextResponse.json({ error: '유효하지 않은 평가 링크입니다. 알림톡으로 전달된 링크를 사용해주세요.' }, { status: 403 });
    }
    const tokenResult = verifyReviewToken(token as string, service_request_id as string);
    if (!tokenResult.valid) {
      return NextResponse.json(
        { error: `평가 링크가 만료되었거나 유효하지 않습니다. (${tokenResult.reason ?? ''})` },
        { status: 403 }
      );
    }

    // 서비스 요청 정보 조회 (partner_id, customer_id)
    const { data: sr, error: srError } = await supabase
      .from('service_requests')
      .select('id, customer_id, assigned_partner_id')
      .eq('id', service_request_id)
      .single();

    if (srError || !sr) {
      return NextResponse.json({ error: '서비스 요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    if (!sr.assigned_partner_id) {
      return NextResponse.json({ error: '배정된 업체가 없습니다.' }, { status: 400 });
    }

    // 중복 리뷰 방지
    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('service_request_id', service_request_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: '이미 평가를 완료하셨습니다.' }, { status: 409 });
    }

    // 리뷰 저장
    const { error: insertError } = await supabase.from('reviews').insert({
      service_request_id,
      partner_id: sr.assigned_partner_id,
      customer_id: sr.customer_id,
      rating,
      comment: comment?.trim() || null,
    });

    if (insertError) {
      return NextResponse.json({ error: '평가 저장 중 오류가 발생했습니다.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

/** DELETE: 리뷰 일괄 삭제 (관리자용) */
async function deleteHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  let ids: string[] = [];
  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get('ids');
  if (idsParam) {
    ids = idsParam.split(',').map((id) => id.trim()).filter(Boolean);
  } else {
    try {
      const body = await request.json();
      ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown): id is string => typeof id === 'string') : [];
    } catch {
      return NextResponse.json({ error: 'ids 배열이 필요합니다.' }, { status: 400 });
    }
  }

  if (ids.length === 0) {
    return NextResponse.json({ error: '삭제할 리뷰 ID가 없습니다.' }, { status: 400 });
  }

  const { error } = await supabase.from('reviews').delete().in('id', ids);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true, deleted: ids.length });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
/** POST: 고객 랜딩(ieum-customer 등)에서 호출 — CORS 적용 */
export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
export const DELETE = withErrorHandler((request: Request) => deleteHandler(request as NextRequest));
