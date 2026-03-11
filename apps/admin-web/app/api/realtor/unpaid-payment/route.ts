/**
 * 공인중개사 앱 미수금 결제 요청 API
 * requestUnpaidPayment(totalAmount) 연동 — 검증 후 성공 응답 (실제 PG 연동은 추후 확장)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'realtor' || !session.realtorId) {
    return NextResponse.json({ error: '공인중개사만 이용할 수 있습니다.' }, { status: 403 });
  }

  let body: { totalAmount?: number; receivableIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const totalAmount = typeof body?.totalAmount === 'number' ? body.totalAmount : 0;
  if (totalAmount <= 0) {
    return NextResponse.json({ error: '결제할 금액이 없습니다.' }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  // 선택 시: receivableIds에 해당하는 미정산 수수료(commissions) 합계와 totalAmount 일치 여부 검증
  const receivableIds = Array.isArray(body?.receivableIds) ? body.receivableIds.filter((id) => typeof id === 'string') : undefined;
  if (receivableIds?.length) {
    const { data: rows } = await supabase
      .from('commissions')
      .select('id, amount')
      .eq('realtor_id', session.realtorId)
      .eq('is_settled', false)
      .in('id', receivableIds);
    const sum = (rows ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    if (Math.abs(sum - totalAmount) > 1) {
      return NextResponse.json({ error: '선택한 항목의 합계와 결제 금액이 일치하지 않습니다.' }, { status: 400 });
    }
  }

  // 실제 PG 연동 전까지는 요청 검증 후 성공 반환 (추후 realtor_unpaid_payment_requests 등 테이블 저장 가능)
  return NextResponse.json({
    success: true,
    message: '미수금 결제 요청이 접수되었습니다.',
  });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
