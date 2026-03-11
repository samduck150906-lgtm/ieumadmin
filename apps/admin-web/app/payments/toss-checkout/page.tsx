'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { requestPayment } from '@/lib/toss/requestPayment';
import { getTossClientKey } from '@/lib/toss/config';

/** Toss SDK 스크립트 미리 로드 (클릭 시 지연 최소화) */
function preloadTossScript() {
  if (typeof window === 'undefined' || window.TossPayments) return;
  const script = document.createElement('script');
  script.src = 'https://js.tosspayments.com/v2/standard';
  script.async = true;
  document.head.appendChild(script);
}

/** 고유 orderId 생성 (Toss 요구: 6~64자, 영문/숫자/-/_) */
function generateOrderId(): string {
  const ts = Date.now().toString(36);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `toss_${ts}_${rnd}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

/**
 * 모바일 웹뷰/브라우저에서 팝업 차단 방지:
 * 결제창은 반드시 사용자 제스처(클릭/탭)에 의해 호출되어야 합니다.
 * useEffect로 자동 호출 시 팝업 차단에 걸리므로, '결제하기' 버튼 클릭 시에만 호출합니다.
 */
export default function TossCheckoutPage() {
  const searchParams = useSearchParams();
  const params = useMemo<URLSearchParams>(
    () => (searchParams != null ? searchParams : new URLSearchParams()),
    [searchParams]
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const startPayment = useCallback(async () => {
    setLoading(true);
    setError(null);

    const session = params.get('session');
    const callback = params.get('callback');
    const callbackFail = params.get('callbackFail');
    const kind = params.get('kind') || 'db-view';
    const flowId = params.get('flowId') || params.get('serviceRequestId') || '';
    const amount = Math.max(0, Math.floor(Number(params.get('amount')) || 0));
    const orderName = params.get('orderName') || `결제 #${flowId || 'unknown'}`;

    if (!session || !callback) {
      setError('결제 정보가 올바르지 않습니다. (session, callback 필요)');
      setLoading(false);
      return;
    }

    const clientKey = getTossClientKey();
    if (!clientKey) {
      setError('Toss Payments 클라이언트 키가 설정되지 않았습니다. (NEXT_PUBLIC_TOSS_CLIENT_KEY)');
      setLoading(false);
      return;
    }

    if (amount < 1) {
      setError('결제 금액이 0원입니다. 0원 결제는 mock-checkout을 사용하세요.');
      setLoading(false);
      return;
    }

    const orderId = generateOrderId();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';

    const confirmParams = new URLSearchParams({
      session,
      callback,
      kind,
      flowId,
      orderId,
      ...(callbackFail && { callbackFail }),
    });
    const successUrl = `${origin}/api/payments/confirm?${confirmParams.toString()}`;
    const failUrl = callbackFail || callback;

    try {
      await requestPayment({
        clientKey,
        amount,
        orderId,
        orderName,
        successUrl,
        failUrl,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '결제창을 열 수 없습니다.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [params]);

  // 초기 검증만 수행 (에러 표시용), 결제 호출은 사용자 클릭 시에만
  const session = params.get('session');
  const callback = params.get('callback');
  const amount = Math.max(0, Math.floor(Number(params.get('amount')) || 0));
  const clientKey = getTossClientKey();
  const isValid = !!(session && callback && clientKey && amount >= 1);

  // 유효한 결제 정보일 때 SDK 미리 로드 (클릭 시 결제창 열림 지연 최소화)
  useEffect(() => {
    if (isValid) preloadTossScript();
  }, [isValid]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="text-center">
          <div className="loading loading-spinner loading-lg text-primary" />
          <p className="mt-4 text-sm text-base-content/70">결제창을 여는 중...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[200px] items-center justify-center p-4">
        <div className="rounded-lg border border-error/30 bg-error/5 p-6 text-center max-w-md">
          <p className="font-medium text-error">결제 시작 실패</p>
          <p className="mt-2 text-sm text-base-content/80">{error}</p>
          <button
            type="button"
            className="btn btn-sm btn-outline mt-4"
            onClick={() => window.history.back()}
          >
            이전으로
          </button>
        </div>
      </div>
    );
  }

  // 유효한 결제 정보일 때만 버튼 표시 (사용자 클릭 시 결제창 호출 → 팝업 차단 방지)
  if (isValid) {
    const amountVal = Math.max(0, Math.floor(Number(params.get('amount')) || 0));
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center p-4">
        <p className="text-sm text-base-content/70 mb-4">
          결제 금액: <span className="font-semibold text-base-content">{amountVal.toLocaleString()}원</span>
        </p>
        <button
          type="button"
          className="btn btn-primary min-h-[48px] min-w-[160px] px-6"
          onClick={startPayment}
        >
          결제하기
        </button>
        <p className="mt-3 text-xs text-base-content/50">버튼을 누르면 토스 결제창이 열립니다</p>
      </div>
    );
  }

  return null;
}
