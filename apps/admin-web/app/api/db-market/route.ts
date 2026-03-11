/**
 * 공인중개사 앱 DB 마켓 목록 — 미배정 서비스 요청 (실 API 연동)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { getRealtorDbMarketList } from '@/lib/api/realtor-db';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

async function getHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'realtor' || !session.realtorId) {
    return NextResponse.json({ error: '공인중개사만 조회할 수 있습니다.' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const category = searchParams.get('category') ?? undefined;
  const regions = searchParams.getAll('regions').filter(Boolean);
  const areaMinPyeong = searchParams.get('areaMinPyeong');
  const areaMaxPyeong = searchParams.get('areaMaxPyeong');
  const dateFrom = searchParams.get('dateFrom') ?? undefined;
  const dateTo = searchParams.get('dateTo') ?? undefined;
  const sort = searchParams.get('sort') ?? undefined;
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10) || 20, 50);
  const cursor = searchParams.get('cursor') ?? undefined;

  try {
    const result = await getRealtorDbMarketList(session.realtorId, {
      category: category || null,
      regions: regions.length ? regions : undefined,
      areaMinPyeong: areaMinPyeong != null ? parseInt(areaMinPyeong, 10) : null,
      areaMaxPyeong: areaMaxPyeong != null ? parseInt(areaMaxPyeong, 10) : null,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
      sort: sort || undefined,
      limit,
      cursor: cursor || null,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : '목록 조회 실패';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
