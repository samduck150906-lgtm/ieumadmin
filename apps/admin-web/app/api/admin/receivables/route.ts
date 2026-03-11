/**
 * 본사: 업체별 미수 목록 (미수 선택 청구용)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { getReceivablesList } from '@/lib/api/payments';
import { withErrorHandler } from '@/lib/api/error-handler';

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'staff' && session.role !== 'admin') return forbiddenResponse();

  const partnerId = request.nextUrl.searchParams.get('partnerId') || undefined;
  const withConsultation = request.nextUrl.searchParams.get('withConsultation') === '1';
  try {
    const list = await getReceivablesList({ partnerId, withConsultation });
    return NextResponse.json({ data: list });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
