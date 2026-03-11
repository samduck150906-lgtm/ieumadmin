/**
 * 공인중개사 앱 DB 마켓 상세 1건 (구매 여부에 따라 마스킹/전체 주소)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { getRealtorDbMarketDetail } from '@/lib/api/realtor-db';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await verifySession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'realtor' || !session.realtorId) {
    return NextResponse.json({ error: '공인중개사만 조회할 수 있습니다.' }, { status: 403 });
  }

  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 });

  try {
    const item = await getRealtorDbMarketDetail(session.realtorId, id);
    if (!item) {
      return NextResponse.json(null, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (e) {
    const message = e instanceof Error ? e.message : '상세 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => getHandler(req as NextRequest, context))(request);
