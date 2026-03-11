/**
 * 본사: 미수 총액·건수 (정산/결제 화면용)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { getReceivableStats } from '@/lib/api/payments';
import { withErrorHandler } from '@/lib/api/error-handler';

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'staff' && session.role !== 'admin') return forbiddenResponse();

  try {
    const stats = await getReceivableStats();
    return NextResponse.json(stats);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
