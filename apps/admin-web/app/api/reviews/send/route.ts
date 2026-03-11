import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { generateReviewToken } from '@/lib/review-token';
import { withErrorHandler } from '@/lib/api/error-handler';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** POST: 작업완료 시 고객에게 평가 요청 발송 (알림톡/SMS) */
async function postHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { service_request_id } = body;

    if (!service_request_id) {
      return NextResponse.json({ error: 'service_request_id is required' }, { status: 400 });
    }

    // 서비스 요청 + 고객 + 파트너 정보 조회
    const { data: sr, error: srError } = await supabase
      .from('service_requests')
      .select(`
        id, category,
        customer:customers!service_requests_customer_id_fkey (id, name, phone),
        assigned_partner:partners!service_requests_assigned_partner_id_fkey (id, business_name)
      `)
      .eq('id', service_request_id)
      .single();

    if (srError || !sr) {
      return NextResponse.json({ error: '서비스 요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
    const partner = Array.isArray(sr.assigned_partner) ? sr.assigned_partner[0] : sr.assigned_partner;

    if (!customer?.phone) {
      return NextResponse.json({ error: '고객 연락처를 찾을 수 없습니다.' }, { status: 400 });
    }

    const landingUrl = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || process.env.NEXT_PUBLIC_LANDING_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum-customer.netlify.app';
    const reviewToken = generateReviewToken(service_request_id);
    const reviewUrl = `${landingUrl}/review/${service_request_id}?token=${reviewToken}`;

    // 알림 로그 저장 (실제 발송은 알림톡/SMS 연동 시 처리)
    await supabase.from('notification_logs').insert({
      recipient_phone: customer.phone,
      recipient_name: customer.name,
      notification_type: 'review_request',
      channel: 'alimtalk',
      template_code: 'REVIEW_REQUEST',
      message_content: `[이음] ${customer.name}님, ${partner?.business_name || '서비스'} 이용은 만족스러우셨나요? 간단한 평가를 부탁드립니다. ${reviewUrl}`,
      service_request_id,
      is_sent: false,
    });

    return NextResponse.json({ success: true, reviewUrl });
  } catch {
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
