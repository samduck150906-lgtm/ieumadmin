/**
 * 고객 마이페이지용 후기 작성 링크 발급 API
 * - 이름+연락처+서비스요청ID로 본인 확인 후 토큰 발급
 * - 전체완료 건만 후기 작성 가능
 * - CORS: 고객 랜딩(ieum-customer, ieum.in)에서 호출
 */
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateReviewToken } from '@/lib/review-token';
import { withCors } from '@/lib/api/cors';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

const PHONE_REGEX = /^01[016789]\d{7,8}$/;

async function getHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: '서비스를 사용할 수 없습니다.' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const name = searchParams.get('name')?.trim() ?? '';
  const phone = (searchParams.get('phone') ?? '').replace(/\D/g, '');
  const serviceRequestId = searchParams.get('service_request_id')?.trim() ?? '';

  if (!name || !PHONE_REGEX.test(phone) || !serviceRequestId) {
    return NextResponse.json(
      { error: '이름, 연락처, 서비스요청ID를 모두 입력해주세요.' },
      { status: 400 }
    );
  }

  try {
    const { data: sr, error: srError } = await supabase
      .from('service_requests')
      .select(`
        id,
        customer_id,
        hq_status,
        customer:customers!service_requests_customer_id_fkey (id, name, phone)
      `)
      .eq('id', serviceRequestId)
      .single();

    if (srError || !sr) {
      return NextResponse.json({ error: '해당 서비스를 찾을 수 없습니다.' }, { status: 404 });
    }

    const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
    if (!customer) {
      return NextResponse.json({ error: '고객 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (customer.phone !== phone || customer.name !== name) {
      return NextResponse.json({ error: '본인 확인에 실패했습니다. 이름과 연락처를 확인해주세요.' }, { status: 403 });
    }

    const pa = await supabase
      .from('partner_assignments')
      .select('status')
      .eq('service_request_id', serviceRequestId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const partnerStatus = pa.data?.status;
    const isCompleted =
      partnerStatus === 'completed' ||
      sr.hq_status === 'settlement_done' ||
      sr.hq_status === 'completed';

    if (!isCompleted) {
      return NextResponse.json(
        { error: '전체 완료된 서비스만 후기를 작성할 수 있습니다.' },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from('reviews')
      .select('id')
      .eq('service_request_id', serviceRequestId)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json({ error: '이미 후기를 작성하셨습니다.' }, { status: 409 });
    }

    const landingUrl =
      process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL ||
      process.env.NEXT_PUBLIC_LANDING_URL ||
      'https://ieum-customer.netlify.app';
    const token = generateReviewToken(serviceRequestId);
    const reviewUrl = `${landingUrl}/review/${serviceRequestId}?token=${token}`;

    return NextResponse.json({ success: true, reviewUrl });
  } catch (err) {
    console.error('[reviews/request-token]', err);
    return NextResponse.json(
      { error: '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export const GET = withCors((req) => getHandler(req as NextRequest));
