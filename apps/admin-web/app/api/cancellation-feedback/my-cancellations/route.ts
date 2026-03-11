import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { SERVICE_CATEGORY_LABELS } from '@/types/database';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

export const dynamic = 'force-dynamic';

const CUSTOMER_REASON_LABELS: Record<string, string> = {
  other_service: '다른곳에서 신청',
  moving_cancelled: '이사가 취소됨',
  pending: '보류중',
  other: '기타사유',
};

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
 * GET: 고객 취소 리스트 (크로스 체크용) — 해당 고객의 취소된 요청 목록 + 고객/업체 취소 내역
 * 쿼리: customer_id
 */
async function getHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Service unavailable' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const customerId = searchParams.get('customer_id');

  if (!customerId) {
    return NextResponse.json({ error: 'customer_id is required' }, { status: 400 });
  }

  const { data: requests, error: srError } = await supabase
    .from('service_requests')
    .select('id, category, created_at, updated_at')
    .eq('customer_id', customerId)
    .eq('hq_status', 'cancelled')
    .order('updated_at', { ascending: false });

  if (srError) {
    return NextResponse.json({ error: srError.message }, { status: 500 });
  }

  if (!requests?.length) {
    return NextResponse.json({ list: [] });
  }

  const ids = requests.map((r) => r.id);

  const [feedbacksRes, assignmentsRes] = await Promise.all([
    supabase
      .from('cancellation_feedbacks')
      .select('service_request_id, reason, reason_detail, created_at')
      .in('service_request_id', ids),
    supabase
      .from('partner_assignments')
      .select(`
        service_request_id,
        cancel_reason,
        cancel_reason_detail,
        updated_at,
        partner:partners!partner_assignments_partner_id_fkey (business_name)
      `)
      .in('service_request_id', ids)
      .eq('status', 'cancelled'),
  ]);

  const feedbackBySrId: Record<
    string,
    { reason: string; reason_label: string; reason_detail: string | null; created_at: string }
  > = {};
  (feedbacksRes.data || []).forEach((f: { service_request_id: string; reason: string; reason_detail: string | null; created_at: string }) => {
    feedbackBySrId[f.service_request_id] = {
      reason: f.reason,
      reason_label: CUSTOMER_REASON_LABELS[f.reason] ?? f.reason,
      reason_detail: f.reason_detail ?? null,
      created_at: f.created_at,
    };
  });

  const partnerBySrId: Record<
    string,
    { partner_business_name: string; cancel_reason: string | null; cancel_reason_label: string | null; cancel_reason_detail: string | null; updated_at: string | null }
  > = {};
  (assignmentsRes.data || []).forEach((pa: {
    service_request_id: string;
    cancel_reason: string | null;
    cancel_reason_detail: string | null;
    updated_at: string | null;
    partner: { business_name: string } | { business_name: string }[];
  }) => {
    const partner = Array.isArray(pa.partner) ? pa.partner[0] : pa.partner;
    const businessName = partner?.business_name ?? '';
    partnerBySrId[pa.service_request_id] = {
      partner_business_name: businessName,
      cancel_reason: pa.cancel_reason ?? null,
      cancel_reason_label:
        pa.cancel_reason != null ? PARTNER_CANCEL_REASON_LABELS[String(pa.cancel_reason)] ?? String(pa.cancel_reason) : null,
      cancel_reason_detail: pa.cancel_reason_detail ?? null,
      updated_at: pa.updated_at ?? null,
    };
  });

  const list = requests.map((r) => ({
    service_request_id: r.id,
    category: r.category,
    category_label: SERVICE_CATEGORY_LABELS[r.category as keyof typeof SERVICE_CATEGORY_LABELS] ?? r.category,
    created_at: r.created_at,
    updated_at: r.updated_at,
    customer_feedback: feedbackBySrId[r.id] ?? null,
    partner_info: partnerBySrId[r.id] ?? null,
  }));

  return NextResponse.json({ list });
}

/** 고객 취소 내역 페이지 — CORS 적용 */
export const GET = withCors(withErrorHandler((request: Request) => getHandler(request as NextRequest)));
