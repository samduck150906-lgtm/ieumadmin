import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { canRequestWithdrawal } from '@/lib/api/settlements';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';
import {
  createWithdrawalPaymentSessionToken,
  buildWithdrawalCheckoutUrl,
  isMockPaymentProvider,
} from '@/lib/payments/payment-session';

/** 출금 신청 + 결제/이체 연동 시작 */
async function postHandler(request: NextRequest) {
  try {
    const session = await verifySession(request);
    if (!session || session.role !== 'realtor') {
      return unauthorizedResponse('공인중개사 로그인이 필요합니다.');
    }

    const body = await request.json().catch(() => ({}));
    const amount = Math.max(0, Number(body?.amount) || 0);
    const bank_name = (body?.bank_name || '').trim();
    const account_number = (body?.account_number || '').trim();
    const account_holder = (body?.account_holder || '').trim();
    if (amount <= 0 || !bank_name || !account_number || !account_holder) {
      return NextResponse.json(
        { error: 'amount, bank_name, account_number, account_holder가 모두 필요합니다.' },
        { status: 400 }
      );
    }

    const check = canRequestWithdrawal();
    if (!check.allowed) {
      return NextResponse.json({ error: check.message }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정이 없습니다.' }, { status: 500 });
    }

    const { data: realtor } = await supabase
      .from('realtors')
      .select('id, account_verified')
      .eq('user_id', session.userId)
      .single();
    if (!realtor) {
      return NextResponse.json({ error: '공인중개사 정보를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (!realtor.account_verified) {
      return NextResponse.json({ error: '계좌인증이 완료되어야 출금 신청이 가능합니다.' }, { status: 403 });
    }

    const { data: existingPending } = await supabase
      .from('withdrawal_requests')
      .select('id')
      .eq('realtor_id', realtor.id)
      .in('status', ['requested', 'approved'])
      .limit(1)
      .maybeSingle();
    if (existingPending) {
      return NextResponse.json(
        { error: '이미 처리 대기 중인 출금 신청이 존재합니다. 완료 후 다시 시도해 주세요.' },
        { status: 409 }
      );
    }

    const { data: withdrawal, error: createError } = await supabase
      .from('withdrawal_requests')
      .insert({
        realtor_id: realtor.id,
        amount,
        bank_name,
        account_number,
        account_holder,
        status: 'requested',
      })
      .select('id, amount, realtor_id')
      .single();
    if (createError || !withdrawal) {
      return NextResponse.json({ error: '출금 신청 생성에 실패했습니다.' }, { status: 400 });
    }

    const sessionToken = createWithdrawalPaymentSessionToken({
      kind: 'withdrawal',
      user_id: session.userId,
      realtor_id: withdrawal.realtor_id,
      withdrawal_id: withdrawal.id,
      amount: withdrawal.amount,
    });

    const baseUrl = new URL(request.url).origin;
    const successCallback = 'eum://payment/success?flow=withdrawal';
    const failCallback = 'eum://payment/fail?flow=withdrawal';
    const checkoutOutput = buildWithdrawalCheckoutUrl(baseUrl, {
      sessionToken,
      callbackUrl: successCallback,
      amount: withdrawal.amount,
      withdrawalId: withdrawal.id,
      orderName: `출금 요청 #${withdrawal.id}`,
    });
    const callbackUrl = new URL(checkoutOutput.paymentUrl);
    callbackUrl.searchParams.set('callbackFail', failCallback);

    return NextResponse.json({
      success: true,
      paymentUrl: callbackUrl.toString(),
      provider: checkoutOutput.provider,
      withdrawalId: withdrawal.id,
      requiresAction: isMockPaymentProvider() || checkoutOutput.provider === 'toss',
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '출금 신청 실패' }, { status: 500 });
  }
}

export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
