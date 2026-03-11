import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { getTossSecretKey } from '@/lib/toss/config';
import { withErrorHandler } from '@/lib/api/error-handler';
import {
  parseDbViewPaymentSessionToken,
  parsePropertyPaymentSessionToken,
  parseWithdrawalPaymentSessionToken,
} from '@/lib/payments/payment-session';
import {
  finalizeDbView,
  finalizeProperty,
  finalizeWithdrawal,
  type FinalizeResult,
} from '@/lib/payments/finalize';

function getSafeCallback(raw: string | null, fallbackPath: string): URL {
  const fallback = new URL(fallbackPath, 'eum://payment');
  if (!raw) return fallback;
  try {
    const candidate = new URL(raw);
    const isDeepLink = candidate.protocol === 'eum:';
    const isSafeHttp = candidate.protocol === 'http:' || candidate.protocol === 'https:';
    if (!isDeepLink && !isSafeHttp) return fallback;
    return candidate;
  } catch {
    return fallback;
  }
}

/** Toss 결제 승인 API 호출 */
async function confirmTossPayment(
  paymentKey: string,
  orderId: string,
  amount: number
): Promise<{ ok: true; paymentKey: string } | { ok: false; message: string }> {
  const secretKey = getTossSecretKey();
  if (!secretKey) {
    return { ok: false, message: 'TOSS_SECRET_KEY가 설정되지 않았습니다.' };
  }

  const auth = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  const res = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      paymentKey,
      orderId,
      amount,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    const msg =
      (errBody as { message?: string })?.message ||
      (errBody as { code?: string })?.code ||
      res.statusText ||
      '결제 승인에 실패했습니다.';
    return { ok: false, message: String(msg) };
  }

  return { ok: true, paymentKey };
}

/**
 * GET /api/payments/confirm
 * - Toss 결제 성공 후 리다이렉트되는 URL
 * - 쿼리: paymentKey, orderId, amount (Toss 추가) + session, callback, kind, flowId, callbackFail (우리 URL)
 */
async function getHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const paymentKey = searchParams.get('paymentKey');
    const orderId = searchParams.get('orderId');
    const amountParam = searchParams.get('amount');
    const sessionToken = searchParams.get('session');
    const callback = searchParams.get('callback');
    const callbackFail = searchParams.get('callbackFail');
    const kind = (searchParams.get('kind') || '').trim();

    if (!paymentKey || !orderId || !amountParam || !sessionToken || !callback) {
      const target = getSafeCallback(callbackFail || callback, 'eum://payment/fail');
      target.searchParams.set('status', 'fail');
      target.searchParams.set('flow', kind || '');
      target.searchParams.set(
        'message',
        encodeURIComponent('결제 정보가 올바르지 않습니다. (paymentKey, orderId, amount, session, callback 필요)')
      );
      return NextResponse.redirect(target);
    }

    const amount = Math.floor(Number(amountParam));
    if (!Number.isFinite(amount) || amount < 1) {
      const target = getSafeCallback(callbackFail || callback, 'eum://payment/fail');
      target.searchParams.set('status', 'fail');
      target.searchParams.set('flow', kind || '');
      target.searchParams.set('message', encodeURIComponent('결제 금액이 올바르지 않습니다.'));
      return NextResponse.redirect(target);
    }

    const confirmResult = await confirmTossPayment(paymentKey, orderId, amount);
    if (!confirmResult.ok) {
      const target = getSafeCallback(callbackFail || callback, 'eum://payment/fail');
      target.searchParams.set('status', 'fail');
      target.searchParams.set('flow', kind || '');
      target.searchParams.set('message', encodeURIComponent(confirmResult.message));
      return NextResponse.redirect(target);
    }

    const supabase = createServerClient();
    if (!supabase) {
      const target = getSafeCallback(callbackFail || callback, 'eum://payment/fail');
      target.searchParams.set('status', 'fail');
      target.searchParams.set('flow', kind || '');
      target.searchParams.set('message', encodeURIComponent('서버 설정이 없습니다.'));
      return NextResponse.redirect(target);
    }

    let result: FinalizeResult = { ok: false, message: '알 수 없는 결제 타입입니다.' };
    const finalCallback = getSafeCallback(callback, 'eum://payment/success');
    const failCallback = getSafeCallback(callbackFail || null, finalCallback.toString());

    try {
      if (kind === 'property') {
        const payload = parsePropertyPaymentSessionToken(sessionToken);
        result = await finalizeProperty(supabase, payload, {
          pgPaymentId: confirmResult.paymentKey,
        });
      } else if (kind === 'withdrawal') {
        const payload = parseWithdrawalPaymentSessionToken(sessionToken);
        result = await finalizeWithdrawal(supabase, payload);
      } else if (kind === 'db-view' || !kind) {
        const payload = parseDbViewPaymentSessionToken(sessionToken);
        result = await finalizeDbView(supabase, payload);
      }
    } catch (error) {
      result = {
        ok: false,
        message: error instanceof Error ? error.message : '세션 검증 실패',
      };
    }

    const target = result.ok ? finalCallback : failCallback;
    target.searchParams.set('status', result.ok ? 'success' : 'fail');
    target.searchParams.set('flow', kind || '');
    target.searchParams.set('message', encodeURIComponent(result.message));
    return NextResponse.redirect(target);
  } catch (error) {
    const fallback = getSafeCallback('eum://payment/fail', 'eum://payment/fail');
    fallback.searchParams.set('status', 'fail');
    fallback.searchParams.set('flow', '');
    fallback.searchParams.set(
      'message',
      encodeURIComponent(error instanceof Error ? error.message : '결제 처리 실패')
    );
    return NextResponse.redirect(fallback);
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
