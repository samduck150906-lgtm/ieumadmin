import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import {
  parseDbViewPaymentSessionToken,
  parsePropertyPaymentSessionToken,
  parseWithdrawalPaymentSessionToken,
} from '@/lib/payments/payment-session';
import { withErrorHandler } from '@/lib/api/error-handler';
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

async function getHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionToken = searchParams.get('session');
    if (!sessionToken) {
      return NextResponse.json({ error: '세션 토큰이 없습니다.' }, { status: 400 });
    }

    const callback = getSafeCallback(searchParams.get('callback'), 'eum://payment/fail');
    const callbackFail = getSafeCallback(searchParams.get('callbackFail') || null, callback.toString());
    const kind = (searchParams.get('kind') || '').trim();

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정이 없습니다.' }, { status: 500 });
    }

    let result: FinalizeResult = { ok: false, message: '알 수 없는 결제 타입입니다.' };
    let nextFlow: string | null = null;
    const finalCallback = callback;

    try {
      if (kind === 'property') {
        const payload = parsePropertyPaymentSessionToken(sessionToken);
        nextFlow = 'property';
        result = await finalizeProperty(supabase, payload);
      } else if (kind === 'withdrawal') {
        const payload = parseWithdrawalPaymentSessionToken(sessionToken);
        nextFlow = 'withdrawal';
        result = await finalizeWithdrawal(supabase, payload);
      } else if (kind === 'db-view' || !kind) {
        const payload = parseDbViewPaymentSessionToken(sessionToken);
        nextFlow = 'db-view';
        result = await finalizeDbView(supabase, payload);
      }
    } catch (error) {
      result = { ok: false, message: error instanceof Error ? error.message : '세션 검증 실패' };
    }

    const target = result.ok ? finalCallback : callbackFail;
    target.searchParams.set('status', result.ok ? 'success' : 'fail');
    target.searchParams.set('flow', nextFlow || kind || '');
    target.searchParams.set('message', encodeURIComponent(result.message));
    return NextResponse.redirect(target);
  } catch (error) {
    const fallback = getSafeCallback('eum://payment/fail', 'eum://payment/fail');
    fallback.searchParams.set('status', 'fail');
    fallback.searchParams.set('flow', 'property');
    fallback.searchParams.set('message', encodeURIComponent(error instanceof Error ? error.message : '결제 처리 실패'));
    return NextResponse.redirect(fallback);
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
