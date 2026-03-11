/**
 * 제휴업체 미수 선택 후 결제 요청 생성 (rpc_create_payment_request)
 * - useMileage/mileageAmount 전달 시 마일리지 우선 차감 후 결제 요청 금액에서 제외
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

async function postHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  if (!partnerId) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  let body: { receivableIds?: string[]; useMileage?: boolean; mileageAmount?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }

  const receivableIds = body.receivableIds;
  if (!Array.isArray(receivableIds) || receivableIds.length === 0) {
    return NextResponse.json({ error: '청구할 미수를 선택하세요.' }, { status: 400 });
  }

  const uuids = receivableIds.filter((id): id is string => typeof id === 'string');
  if (uuids.length === 0) {
    return NextResponse.json({ error: '유효한 미수 ID가 없습니다.' }, { status: 400 });
  }

  const useMileage = Boolean(body.useMileage);
  const mileageAmount = Math.max(0, Math.floor(Number(body.mileageAmount) || 0));

  // 본인 미수만 허용: 해당 receivable이 이 partner 소속인지 확인 + 총액 조회
  const { data: rows } = await supabase
    .from('partner_receivables')
    .select('id, amount')
    .eq('partner_id', partnerId)
    .eq('is_paid', false)
    .in('id', uuids);
  const allowedIds = (rows || []).map((r: { id: string }) => r.id);
  const totalAmount = (rows || []).reduce((sum: number, r: { amount?: number }) => sum + Number(r.amount ?? 0), 0);
  if (allowedIds.length === 0) {
    return NextResponse.json({ error: '선택한 미수 중 청구 가능한 건이 없습니다.' }, { status: 400 });
  }

  // 마일리지 적용 시 잔액 초과 여부 검증
  const appliedMileage = useMileage ? Math.min(mileageAmount, totalAmount) : 0;
  if (appliedMileage > 0) {
    const { data: mb } = await supabase
      .from('partner_mileage_balance')
      .select('balance')
      .eq('partner_id', partnerId)
      .maybeSingle();
    const balance = Number(mb?.balance ?? 0);
    if (balance < appliedMileage) {
      return NextResponse.json(
        { error: `마일리지 잔액(₩${balance.toLocaleString()})이 부족합니다. 적용 요청: ₩${appliedMileage.toLocaleString()}` },
        { status: 400 }
      );
    }
  }

  const { data: rpcResult, error: rpcError } = await supabase.rpc('rpc_create_payment_request', {
    p_receivable_ids: allowedIds,
    p_method: 'transfer',
    p_requested_by: session.userId ?? null,
  });

  if (rpcError) {
    return NextResponse.json(
      { error: rpcError.message || '결제 요청 생성 실패' },
      { status: 500 }
    );
  }

  const result = rpcResult as { success?: boolean; error?: string; payment_request_id?: string; amount?: number };
  if (result?.success === false) {
    return NextResponse.json({ error: result.error || '처리 실패' }, { status: 400 });
  }

  const paymentRequestId = result?.payment_request_id;
  let finalAmount = Number(result?.amount ?? totalAmount);

  // 마일리지 차감 + 결제 요청 금액 조정 (실결제액 = 총액 - 마일리지)
  if (appliedMileage > 0 && paymentRequestId) {
    const { data: useResult, error: useErr } = await supabase.rpc('use_partner_mileage', {
      p_partner_id: partnerId,
      p_amount: appliedMileage,
      p_type: 'used_payment',
      p_reference_id: paymentRequestId,
      p_note: `미수금 결제 마일리지 차감 (${allowedIds.length}건)`,
    });
    if (useErr || (useResult as { success?: boolean })?.success === false) {
      return NextResponse.json(
        { error: '마일리지 차감 처리에 실패했습니다. 결제 요청은 생성되었으나 마일리지가 적용되지 않았습니다.' },
        { status: 500 }
      );
    }
    finalAmount = Math.max(0, totalAmount - appliedMileage);
    await supabase
      .from('partner_payment_requests')
      .update({ amount: finalAmount })
      .eq('id', paymentRequestId);
  }

  return NextResponse.json({
    success: true,
    payment_request_id: paymentRequestId,
    amount: finalAmount,
    mileage_applied: appliedMileage,
  });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
