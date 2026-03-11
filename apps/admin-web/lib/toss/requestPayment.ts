/**
 * Toss Payments requestPayment 클라이언트 함수
 * - 결제창 SDK 로드 후 requestPayment 호출
 * - 성공 시 successUrl로 리다이렉트 (paymentKey, orderId, amount 포함)
 */

export interface RequestPaymentParams {
  clientKey: string;
  amount: number;
  orderId: string;
  orderName: string;
  successUrl: string;
  failUrl: string;
  customerEmail?: string;
  customerName?: string;
}

declare global {
  interface Window {
    TossPayments?: (clientKey: string) => {
      payment: () => {
        requestPayment: (params: {
          method: string;
          amount: { currency: string; value: number };
          orderId: string;
          orderName: string;
          successUrl: string;
          failUrl: string;
          customerEmail?: string;
          customerName?: string;
        }) => Promise<void>;
      };
    };
  }
}

/** Toss SDK 스크립트 로드 */
function loadTossScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('브라우저 환경에서만 실행 가능합니다.'));
      return;
    }
    if (window.TossPayments) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://js.tosspayments.com/v2/standard';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Toss Payments SDK 로드 실패'));
    document.head.appendChild(script);
  });
}

/**
 * Toss 결제창 요청
 * - 카드/간편결제 통합결제창 사용
 * - 성공 시 successUrl로 리다이렉트 (Toss가 paymentKey, orderId, amount 쿼리 추가)
 */
export async function requestPayment(params: RequestPaymentParams): Promise<void> {
  await loadTossScript();

  const TossPayments = window.TossPayments;
  if (!TossPayments) {
    throw new Error('Toss Payments SDK를 불러올 수 없습니다.');
  }

  const tossPayments = TossPayments(params.clientKey);
  const payment = tossPayments.payment();

  await payment.requestPayment({
    method: 'CARD',
    amount: {
      currency: 'KRW',
      value: params.amount,
    },
    orderId: params.orderId,
    orderName: params.orderName,
    successUrl: params.successUrl,
    failUrl: params.failUrl,
    ...(params.customerEmail && { customerEmail: params.customerEmail }),
    ...(params.customerName && { customerName: params.customerName }),
  });
}
