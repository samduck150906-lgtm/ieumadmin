import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

export const dynamic = 'force-dynamic';

const PARTNER_CANCEL_REASON_LABELS: Record<string, string> = {
  customer_cancel: '고객 일방취소',
  other_partner: '타업체에 하기로함',
  partner_issue: '본 업체 사정으로 취소',
};

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

/**
 * GET: 고객 취소 리스트 크로스 체크용 — 해당 요청에 대한 배정 업체의 취소 내역 조회
 * 쿼리: service_request_id
 * (고객이 취소/피드백 페이지에서 업체 측 기록을 볼 수 있도록 공개 API)
 */
async function getHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const serviceRequestId = searchParams.get('service_request_id');

  if (!serviceRequestId) {
    return NextResponse.json({ error: 'service_request_id is required' }, { status: 400 });
  }

  const { data: pa, error } = await supabase
    .from('partner_assignments')
    .select(`
      id,
      cancel_reason,
      cancel_reason_detail,
      updated_at,
      partner:partners!partner_assignments_partner_id_fkey (id, business_name)
    `)
    .eq('service_request_id', serviceRequestId)
    .eq('status', 'cancelled')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!pa) {
    return NextResponse.json({ partnerInfo: null });
  }

  const partner = Array.isArray(pa.partner) ? pa.partner[0] : pa.partner;
  const partnerBusinessName =
    partner && typeof partner === 'object' && 'business_name' in partner
      ? (partner as { business_name: string }).business_name
      : null;

  return NextResponse.json({
    partnerInfo: {
      partner_business_name: partnerBusinessName ?? null,
      cancel_reason: pa.cancel_reason ?? null,
      cancel_reason_label:
        pa.cancel_reason != null
          ? PARTNER_CANCEL_REASON_LABELS[String(pa.cancel_reason)] ?? String(pa.cancel_reason)
          : null,
      cancel_reason_detail: pa.cancel_reason_detail ?? null,
      updated_at: pa.updated_at ?? null,
    },
  });
}

/** 고객 취소 페이지에서 배정 업체 취소 내역 조회 — CORS 적용 */
export const GET = withCors(withErrorHandler((request: Request) => getHandler(request as NextRequest)));
