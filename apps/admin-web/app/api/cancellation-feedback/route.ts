import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** GET: 취소 피드백 목록 조회 (본사용) */
async function getHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');

  const from = (page - 1) * limit;
  const { data, error, count } = await supabase
    .from('cancellation_feedbacks')
    .select(`
      *,
      customer:customers!cancellation_feedbacks_customer_id_fkey (id, name, phone),
      service_request:service_requests!cancellation_feedbacks_service_request_id_fkey (id, category, assigned_partner_id,
        assigned_partner:partners!service_requests_assigned_partner_id_fkey (id, business_name)
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + limit - 1);

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

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));

/** POST: 고객 취소 피드백 제출 — 고객 랜딩(ieum-customer 등)에서 호출, CORS 적용 */
async function postHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { service_request_id, reason, reason_detail } = body;

    if (!service_request_id || !reason) {
      return NextResponse.json({ error: '필수 항목을 입력해주세요.' }, { status: 400 });
    }

    const validReasons = ['other_service', 'moving_cancelled', 'pending', 'other'];
    if (!validReasons.includes(reason)) {
      return NextResponse.json({ error: '올바른 취소 사유를 선택해주세요.' }, { status: 400 });
    }

    // 서비스 요청 정보 조회
    const { data: sr, error: srError } = await supabase
      .from('service_requests')
      .select('id, customer_id')
      .eq('id', service_request_id)
      .single();

    if (srError || !sr) {
      return NextResponse.json({ error: '서비스 요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    // 중복 피드백 방지
    const { data: existing } = await supabase
      .from('cancellation_feedbacks')
      .select('id')
      .eq('service_request_id', service_request_id)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: '이미 피드백을 제출하셨습니다.' }, { status: 409 });
    }

    // 피드백 저장
    const { error: insertError } = await supabase.from('cancellation_feedbacks').insert({
      service_request_id,
      customer_id: sr.customer_id,
      reason,
      reason_detail: reason_detail?.trim() || null,
    });

    if (insertError) {
      return NextResponse.json({ error: '피드백 저장 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // 서비스 요청 상태를 취소로 업데이트
    await supabase.from('service_requests').update({ hq_status: 'cancelled' }).eq('id', service_request_id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
