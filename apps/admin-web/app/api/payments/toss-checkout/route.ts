import { NextRequest, NextResponse } from 'next/server';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * Toss 결제 페이지로 리다이렉트 (하위 호환)
 * - 기존 /api/payments/toss-checkout URL을 /payments/toss-checkout 페이지로 연결
 */
async function getHandler(request: NextRequest) {
  const redirectUrl = new URL(request.url);
  redirectUrl.pathname = '/payments/toss-checkout';
  return NextResponse.redirect(redirectUrl);
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));

