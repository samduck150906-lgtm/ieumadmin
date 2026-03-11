/**
 * 공인중개사 앱 DB 마켓 구매 — 구매 기록 저장 후 고객 연락처 반환
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { purchaseRealtorDb } from '@/lib/api/realtor-db';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifySession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'realtor' || !session.realtorId) {
    return NextResponse.json({ error: '공인중개사만 구매할 수 있습니다.' }, { status: 403 });
  }

  const { id: itemId } = await context.params;
  if (!itemId) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  try {
    const result = await purchaseRealtorDb(session.realtorId, itemId);
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '구매 처리 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => postHandler(req as NextRequest, context))(request);
