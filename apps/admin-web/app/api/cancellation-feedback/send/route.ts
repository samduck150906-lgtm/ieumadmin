import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withErrorHandler } from '@/lib/api/error-handler';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/** POST: 취소 시 고객에게 취소 사유 피드백 요청 발송 */
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

    const { data: sr, error: srError } = await supabase
      .from('service_requests')
      .select(`
        id, category,
        customer:customers!service_requests_customer_id_fkey (id, name, phone)
      `)
      .eq('id', service_request_id)
      .single();

    if (srError || !sr) {
      return NextResponse.json({ error: '서비스 요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;

    if (!customer?.phone) {
      return NextResponse.json({ error: '고객 연락처를 찾을 수 없습니다.' }, { status: 400 });
    }

    const landingUrl = process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL || process.env.NEXT_PUBLIC_LANDING_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum-customer.netlify.app';
    const feedbackUrl = `${landingUrl}/feedback/${service_request_id}`;

    await supabase.from('notification_logs').insert({
      recipient_phone: customer.phone,
      recipient_name: customer.name,
      notification_type: 'cancellation_feedback',
      channel: 'alimtalk',
      template_code: 'CANCEL_FEEDBACK_REQUEST',
      message_content: `[이음] ${customer.name}님, 서비스 취소 사유를 알려주시면 더 나은 서비스를 제공하겠습니다. ${feedbackUrl}`,
      service_request_id,
      is_sent: false,
    });

    return NextResponse.json({ success: true, feedbackUrl });
  } catch {
    return NextResponse.json({ error: '처리 중 오류가 발생했습니다.' }, { status: 500 });
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
