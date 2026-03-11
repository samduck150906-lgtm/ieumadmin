/**
 * 리드관리 - 수익금 정산내역 API (일별/월별)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { getSettlementRevenueDaily, getSettlementRevenueMonthly } from '@/lib/api/settlement-revenue';
import { withErrorHandler } from '@/lib/api/error-handler';

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'staff' && session.role !== 'admin') return forbiddenResponse();

  const year = request.nextUrl.searchParams.get('year');
  const month = request.nextUrl.searchParams.get('month');
  const view = request.nextUrl.searchParams.get('view') || 'daily'; // daily | monthly

  const y = year ? parseInt(year, 10) : new Date().getFullYear();
  const m = month ? parseInt(month, 10) : undefined;

  if (Number.isNaN(y) || y < 2000 || y > 2100) {
    return NextResponse.json({ error: '유효한 연도가 필요합니다.' }, { status: 400 });
  }
  if (view === 'daily') {
    const monthNum = m ?? new Date().getMonth() + 1;
    if (monthNum < 1 || monthNum > 12) {
      return NextResponse.json({ error: '유효한 월이 필요합니다.' }, { status: 400 });
    }
    try {
      const data = await getSettlementRevenueDaily(y, monthNum);
      return NextResponse.json({ data, view: 'daily' });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : '조회 실패' },
        { status: 500 }
      );
    }
  }

  try {
    const data = await getSettlementRevenueMonthly(y, m);
    return NextResponse.json({ data, view: 'monthly' });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
