import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { getDbViewPrice, getDbCompletionPrice, isZeroWonPurchaseInCooldown } from '@/lib/api/partner-db';
import { createDbViewPaymentSessionToken, buildDbViewCheckoutUrl, isMockPaymentProvider } from '@/lib/payments/payment-session';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 제휴업체 DB 열람용 결제창 URL 발급 */
async function postHandler(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session || session.role !== 'partner' || !session.partnerId) {
      return unauthorizedResponse('파트너 로그인이 필요합니다.');
    }

    const body = await request.json().catch(() => ({}));
    const serviceRequestId = (body?.service_request_id || '').trim();
    const useMileage = Boolean(body?.use_mileage);
    const mileageAmount = Math.max(0, Math.floor(Number(body?.mileage_amount) || 0));
    if (!serviceRequestId) {
      return NextResponse.json({ error: 'service_request_id가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정이 없습니다.' }, { status: 500 });
    }

    const { data: requestRow } = await supabase
      .from('service_requests')
      .select('id, category, assigned_partner_id, customer:customers!service_requests_customer_id_fkey(area_size, area_pyeong_exact, moving_type)')
      .eq('id', serviceRequestId)
      .single();
    if (!requestRow) {
      return NextResponse.json({ error: '해당 DB를 찾을 수 없습니다.' }, { status: 404 });
    }

    if (requestRow.assigned_partner_id === session.partnerId) {
      return NextResponse.json({ success: true, unlocked: true, amount: 0, message: '이미 배정되어 열람 가능합니다.' });
    }
    if (requestRow.assigned_partner_id && requestRow.assigned_partner_id !== session.partnerId) {
      return NextResponse.json({ error: '이미 다른 제휴업체가 배정받은 요청입니다.' }, { status: 409 });
    }

    const customer = Array.isArray(requestRow.customer) ? requestRow.customer[0] : requestRow.customer;
    const amount = Math.max(0, Math.floor(await getDbViewPrice(requestRow.category, customer)));
    const completionPrice = Math.max(0, Math.floor(await getDbCompletionPrice(requestRow.category, customer)));

    if (amount === 0) {
      const inCooldown = await isZeroWonPurchaseInCooldown(session.partnerId);
      if (inCooldown) {
        return NextResponse.json(
          { error: '0원 구매는 10분에 한 번만 가능합니다. 잠시 후 다시 시도해 주세요.' },
          { status: 429 }
        );
      }
      const { data: lockResult } = await supabase.rpc('purchase_db_with_lock', {
        p_service_request_id: serviceRequestId,
        p_partner_id: session.partnerId,
      });
      if (lockResult?.success) {
        // 0원 구매: payment_method를 'free'로 기록
        await supabase
          .from('db_view_payments')
          .update({ payment_method: 'free' })
          .eq('partner_id', session.partnerId)
          .eq('service_request_id', serviceRequestId);
        return NextResponse.json({ success: true, unlocked: true, amount: 0, message: '0원 구매가 완료되었습니다.' });
      }
      return NextResponse.json({ error: lockResult?.error || '열람 처리 실패' }, { status: 409 });
    }

    const { data: lockResult, error: lockError } = await supabase.rpc('lock_db_for_purchase', {
      p_service_request_id: serviceRequestId,
      p_partner_id: session.partnerId,
    });
    if (lockError) {
      return NextResponse.json({ error: lockError.message || '결제 잠금에 실패했습니다.' }, { status: 500 });
    }

    if (lockResult?.success === false) {
      return NextResponse.json({ error: lockResult?.error || '현재 결제할 수 없습니다.' }, { status: 409 });
    }
    if (lockResult?.already_assigned) {
      return NextResponse.json({ success: true, unlocked: true, amount: 0, message: '이미 배정된 건은 결제 없이 열람 가능합니다.' });
    }

    const lockAmount = Number(lockResult?.view_price ?? amount);
    if (!Number.isFinite(lockAmount) || lockAmount < 1) {
      return NextResponse.json({ error: '결제 금액 계산 오류입니다.' }, { status: 400 });
    }

    // 마일리지 적용: 잔액 조회 후 실결제 금액 산정
    let amountToCharge = lockAmount;
    let mileageUsed = 0;
    if (useMileage && mileageAmount > 0) {
      const { data: mb } = await supabase
        .from('partner_mileage_balance')
        .select('balance')
        .eq('partner_id', session.partnerId)
        .maybeSingle();
      const balance = Number(mb?.balance ?? 0);
      mileageUsed = Math.min(mileageAmount, balance, lockAmount);
      amountToCharge = Math.max(0, lockAmount - mileageUsed);
    }

    // 실결제 0원(마일리지 전액): 결제창 없이 즉시 확정
    if (amountToCharge < 1) {
      const { data: confirmResult, error: confirmErr } = await supabase.rpc('confirm_db_purchase', {
        p_service_request_id: serviceRequestId,
        p_partner_id: session.partnerId,
        p_amount: 0,
        p_view_price: lockAmount,
        p_completion_price: Math.floor(Number(lockResult?.completion_price ?? completionPrice)),
      });
      if (confirmErr || !confirmResult?.success) {
        await supabase.rpc('unlock_db_purchase', {
          p_service_request_id: serviceRequestId,
          p_partner_id: session.partnerId,
        });
        return NextResponse.json({ error: confirmResult?.error || confirmErr?.message || '마일리지 결제 확정 실패' }, { status: 500 });
      }
      if (mileageUsed > 0) {
        await supabase.rpc('use_partner_mileage', {
          p_partner_id: session.partnerId,
          p_amount: mileageUsed,
          p_type: 'used_db_purchase',
          p_reference_id: serviceRequestId,
          p_note: `DB 열람 마일리지 차감 (요청ID: ${serviceRequestId})`,
        });
      }
      await supabase
        .from('db_view_payments')
        .update({ payment_method: 'mileage' })
        .eq('partner_id', session.partnerId)
        .eq('service_request_id', serviceRequestId);
      return NextResponse.json({ success: true, unlocked: true, amount: 0, message: '마일리지로 구매가 완료되었습니다.' });
    }

    const token = createDbViewPaymentSessionToken({
      kind: 'db-view',
      partner_id: session.partnerId,
      service_request_id: serviceRequestId,
      view_price: Math.floor(amountToCharge),
      completion_price: Math.floor(Number(lockResult?.completion_price ?? completionPrice)),
      mileage_used: mileageUsed > 0 ? mileageUsed : undefined,
    });

    const baseUrl = new URL(request.url).origin;
    // PC 어드민에서 호출되므로 eum:// 딥링크 대신 웹 URL 사용
    const successCallback = `${baseUrl}/partner/db-list?payment=success&serviceRequestId=${encodeURIComponent(serviceRequestId)}`;
    const failCallback = `${baseUrl}/partner/db-list?payment=fail&serviceRequestId=${encodeURIComponent(serviceRequestId)}`;
    const checkoutOutput = buildDbViewCheckoutUrl(baseUrl, {
      sessionToken: token,
      serviceRequestId,
      amount: amountToCharge,
      callbackUrl: successCallback,
      orderName: `DB 열람 #${serviceRequestId}`,
    });
    const checkoutUrl = new URL(checkoutOutput.paymentUrl);
    checkoutUrl.searchParams.set('callbackFail', failCallback);

    return NextResponse.json({
      success: true,
      paymentUrl: checkoutUrl.toString(),
      provider: checkoutOutput.provider,
      amount: amountToCharge,
      requiresAction: isMockPaymentProvider() || checkoutOutput.provider === 'toss',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'DB 결제 시작 실패' }, { status: 500 });
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
