import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/** 파트너 상세 조회 (staff/admin 전용) */
async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: partnerId } = await context.params;
  if (!partnerId) {
    return NextResponse.json({ error: 'partner id 필요' }, { status: 400 });
  }

  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });

  const [partnerRes, mileageRes, assignmentRes, viewPayRes, receivableRes] = await Promise.all([
    supabase
      .from('partners')
      .select(`
        id, user_id, business_name, representative_name, business_number,
        address, contact_phone, manager_name, manager_phone, manager_email,
        service_categories, avg_rating, total_reviews, created_at, updated_at,
        user:users!partners_user_id_fkey (id, email, name, status, created_at)
      `)
      .eq('id', partnerId)
      .single(),

    supabase
      .from('partner_mileage_balance')
      .select('balance, total_earned, total_used')
      .eq('partner_id', partnerId)
      .maybeSingle(),

    supabase
      .from('partner_assignments')
      .select('status')
      .eq('partner_id', partnerId),

    supabase
      .from('db_view_payments')
      .select('amount')
      .eq('partner_id', partnerId),

    supabase
      .from('partner_receivables')
      .select('amount')
      .eq('partner_id', partnerId)
      .eq('is_paid', false),
  ]);

  if (partnerRes.error || !partnerRes.data) {
    return NextResponse.json(
      { error: partnerRes.error?.message ?? '파트너를 찾을 수 없습니다.' },
      { status: 404 }
    );
  }

  // 배정 건수 상태별 집계
  const assignmentCounts: Record<string, number> = {};
  for (const row of assignmentRes.data ?? []) {
    assignmentCounts[row.status] = (assignmentCounts[row.status] ?? 0) + 1;
  }

  // DB 열람 총액
  const totalViewPay = (viewPayRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  // 미수금 합계
  const totalReceivable = (receivableRes.data ?? []).reduce((s, r) => s + (r.amount ?? 0), 0);

  return NextResponse.json({
    ...partnerRes.data,
    mileage: {
      balance: mileageRes.data?.balance ?? 0,
      totalEarned: mileageRes.data?.total_earned ?? 0,
      totalUsed: mileageRes.data?.total_used ?? 0,
    },
    stats: {
      assignmentCounts,
      totalAssignments: (assignmentRes.data ?? []).length,
      totalViewPay,
      totalReceivable,
    },
  });
}

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => getHandler(req as NextRequest, context))(request);
