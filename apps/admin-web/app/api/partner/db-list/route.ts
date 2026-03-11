import { NextRequest, NextResponse } from 'next/server';
import { getPartnerDbList } from '@/lib/api/partner-db';
import type { PartnerDbListFilter } from '@/lib/api/partner-db';
import { verifySession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 제휴업체 DB 목록 (모자이크 적용). staff: partnerId 쿼리, partner: 본인만 */
async function getHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return unauthorizedResponse();

  let partnerId: string | null = null;

  if (session.role === 'staff') {
    partnerId = request.nextUrl.searchParams.get('partnerId');
  } else if (session.role === 'partner') {
    partnerId = session.partnerId ?? null;
  } else {
    return forbiddenResponse();
  }

  if (!partnerId) {
    return NextResponse.json({ error: 'Partner ID required' }, { status: 400 });
  }

  const movingDatesParam = request.nextUrl.searchParams.get('movingDates');
  const movingDates = movingDatesParam ? movingDatesParam.split(',').map((d) => d.trim()).filter(Boolean) : undefined;

  const filter: PartnerDbListFilter = {
    category: request.nextUrl.searchParams.get('category') || undefined,
    region: request.nextUrl.searchParams.get('region') || undefined,
    areaSize: request.nextUrl.searchParams.get('areaSize') || undefined,
    dateFrom: request.nextUrl.searchParams.get('dateFrom') || undefined,
    dateTo: request.nextUrl.searchParams.get('dateTo') || undefined,
    movingDates,
    movingType: request.nextUrl.searchParams.get('movingType') || undefined,
    requestedProduct: request.nextUrl.searchParams.get('requestedProduct') || undefined,
  };

  const list = await getPartnerDbList(partnerId, filter);
  return NextResponse.json({ data: list });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
