/**
 * 본사: 미수 선택 청구 → 결제요청 생성 (업체별 RPC)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { createPaymentRequestFromReceivables } from '@/lib/api/payments';
import { withErrorHandler } from '@/lib/api/error-handler';

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'staff' && session.role !== 'admin') return forbiddenResponse();

  let body: { receivableIds?: string[]; paymentMethod?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '요청 본문이 올바르지 않습니다.' }, { status: 400 });
  }
  const rawIds = Array.isArray(body?.receivableIds) ? body.receivableIds : [];
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const receivableIds = rawIds
    .filter((id): id is string => typeof id === 'string' && uuidLike.test(id))
    .slice(0, 500);
  if (receivableIds.length === 0) {
    return NextResponse.json({ error: '청구할 미수를 선택하세요.' }, { status: 400 });
  }
  const paymentMethod: 'card' | 'transfer' =
    body?.paymentMethod === 'card' ? 'card' : 'transfer';

  try {
    const result = await createPaymentRequestFromReceivables(receivableIds, session.userId, paymentMethod);
    return NextResponse.json({
      success: true,
      created: result.created,
      paymentRequestIds: result.paymentRequestIds,
      paymentMethod,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '결제요청 생성 실패' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
