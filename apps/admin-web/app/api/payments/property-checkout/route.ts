import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import {
  createPropertyPaymentSessionToken,
  buildPropertyCheckoutUrl,
  isMockPaymentProvider,
} from '@/lib/payments/payment-session';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 매물 열람 결제 시작 (모바일 앱/외부 PG 연동용) */
async function postHandler(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session || session.role !== 'realtor') {
      return unauthorizedResponse('공인중개사 로그인이 필요합니다.');
    }

    const body = await request.json().catch(() => ({}));
    const propertyId = (body?.propertyId || '').trim();
    const amount = Math.max(0, Math.floor(Number(body?.amount) || 0));
    if (!propertyId) {
      return NextResponse.json({ error: 'propertyId가 필요합니다.' }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정이 없습니다.' }, { status: 500 });
    }

    const { data: property } = await supabase
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .single();
    if (!property) {
      return NextResponse.json({ error: '매물을 찾을 수 없습니다.' }, { status: 404 });
    }

    const { data: existingUnlock } = await supabase
      .from('property_unlocks')
      .select('id')
      .eq('user_id', session.userId)
      .eq('property_id', propertyId)
      .maybeSingle();
    if (existingUnlock) {
      return NextResponse.json({
        success: true,
        unlocked: true,
        message: '이미 열람 가능합니다.',
      });
    }

    if (amount <= 0) {
      const { data: payment } = await supabase
        .from('payments')
        .insert({
          user_id: session.userId,
          property_id: propertyId,
          amount: 0,
          pg_payment_id: 'free',
          idempotency_key: `property:${session.userId}:${propertyId}:free`,
          status: 'completed',
        })
        .select('id')
        .single();
      if (!payment) {
        return NextResponse.json({ error: '결제 기록에 실패했습니다.' }, { status: 400 });
      }

      const { error: unlockError } = await supabase
        .from('property_unlocks')
        .insert({ user_id: session.userId, property_id: propertyId, payment_id: payment.id });
      if (unlockError) {
        return NextResponse.json({ error: '열람 잠금 해제 처리에 실패했습니다.' }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        unlocked: true,
        message: '0원 열람 처리되었습니다.',
      });
    }

    const sessionToken = createPropertyPaymentSessionToken({
      kind: 'property',
      user_id: session.userId,
      property_id: propertyId,
      amount,
    });

    const baseUrl = new URL(request.url).origin;
    const successCallback = `eum://payment/success?flow=property&propertyId=${encodeURIComponent(propertyId)}`;
    const failCallback = `eum://payment/fail?flow=property&propertyId=${encodeURIComponent(propertyId)}`;
    const checkoutOutput = buildPropertyCheckoutUrl(baseUrl, {
      sessionToken,
      callbackUrl: successCallback,
      amount,
      propertyId,
      orderName: `매물 열람 #${propertyId}`,
    });
    const callbackUrl = new URL(checkoutOutput.paymentUrl);
    callbackUrl.searchParams.set('callbackFail', failCallback);

    return NextResponse.json({
      success: true,
      paymentUrl: callbackUrl.toString(),
      provider: checkoutOutput.provider,
      amount,
      requiresAction: isMockPaymentProvider() || checkoutOutput.provider === 'toss',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '결제 시작 실패' }, { status: 500 });
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
