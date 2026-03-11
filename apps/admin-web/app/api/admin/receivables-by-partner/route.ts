/**
 * 본사: 업체별 미수금 집계 — 누가 얼마를 내야 하는지 (기초 정산 가시화)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { getReceivablesByPartner } from '@/lib/api/payments';
import { withErrorHandler } from '@/lib/api/error-handler';

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'staff' && session.role !== 'admin') return forbiddenResponse();

  try {
    const list = await getReceivablesByPartner();
    return NextResponse.json({ data: list });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
