/**
 * 제휴업체 미수금 상세 목록 API
 * 예약 완료되었으나 미납된 상담 건 목록 (고객명, 예약일, 미수금액 등)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export interface PartnerReceivableRow {
  id: string;
  amount: number;
  receivable_month: string;
  service_request_id: string;
  customer_name: string;
  customer_phone: string;
  category: string;
  reservation_date: string | null;
  created_at: string;
}

async function getHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const session = await verifyPartnerSession(request);
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  const partnerId = session.partnerId;
  if (!partnerId) {
    return NextResponse.json({
      receivableTotal: 0,
      receivableCount: 0,
      list: [],
    });
  }

  try {
    const { data: recv, error } = await supabase
      .from('partner_receivables')
      .select('id, amount, receivable_month, service_request_id, created_at')
      .eq('partner_id', partnerId)
      .eq('is_paid', false)
      .order('receivable_month', { ascending: false });

    if (error) {
      console.error('[partner/receivables]', error.message);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = recv || [];
    if (rows.length === 0) {
      return NextResponse.json({
        receivableTotal: 0,
        receivableCount: 0,
        list: [],
      });
    }

    const srIds = [...new Set(rows.map((r: { service_request_id: string }) => r.service_request_id))];

    const [srsRes, paRes] = await Promise.all([
      supabase.from('service_requests').select('id, customer_id, category').in('id', srIds),
      supabase.from('partner_assignments').select('service_request_id, installation_date, completed_at').eq('partner_id', partnerId).in('service_request_id', srIds),
    ]);

    const srs = srsRes.data || [];
    const pas = paRes.data || [];
    const customerIds = [...new Set(srs.map((s: { customer_id: string }) => s.customer_id))];
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, phone')
      .in('id', customerIds);

    const srMap = new Map(srs.map((s: { id: string; customer_id: string; category: string }) => [s.id, s]));
    const custMap = new Map((customers || []).map((c: { id: string; name: string; phone: string }) => [c.id, c]));
    const paMap = new Map(pas.map((p: { service_request_id: string; installation_date?: string; completed_at?: string }) => [p.service_request_id, p]));

    const CATEGORY_LABELS: Record<string, string> = {
      moving: '이사',
      cleaning: '청소',
      internet_tv: '인터넷/TV',
    };

    const list: PartnerReceivableRow[] = rows.map((r: {
      id: string;
      amount: number;
      receivable_month: string;
      service_request_id: string;
      created_at: string;
    }) => {
      const sr = srMap.get(r.service_request_id);
      const cust = sr ? custMap.get(sr.customer_id) : null;
      const pa = paMap.get(r.service_request_id);
      const reservationDate = pa?.installation_date || pa?.completed_at || null;
      return {
        id: r.id,
        amount: Number(r.amount || 0),
        receivable_month: r.receivable_month ? String(r.receivable_month).slice(0, 10) : '',
        service_request_id: r.service_request_id,
        customer_name: cust?.name ?? '-',
        customer_phone: cust?.phone ?? '-',
        category: CATEGORY_LABELS[sr?.category ?? ''] ?? sr?.category ?? '-',
        reservation_date: reservationDate ? String(reservationDate).slice(0, 10) : null,
        created_at: r.created_at,
      };
    });

    const receivableTotal = list.reduce((s, r) => s + r.amount, 0);

    return NextResponse.json({
      receivableTotal,
      receivableCount: list.length,
      list,
    });
  } catch (e) {
    console.error('[partner/receivables]', e);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
