/**
 * 공인중개사 수익 실시간 알림 발송 API
 * - 예정수익금/상담요청/전환수익금/추천수익금 변동 시 공인중개사에게 알림 발송
 * - 본사 직원 인증 또는 크론 시크릿 인증 필요
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession } from '@/lib/auth-middleware';
import {
  sendRealtorRevenueNotification,
  type RealtorRevenueType,
} from '@/lib/notify-realtor-revenue';
import { withErrorHandler } from '@/lib/api/error-handler';

function authCheck(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader === `Bearer ${secret}`) return true;
  }
  return false;
}

const VALID_REVENUE_TYPES: RealtorRevenueType[] = [
  'expected',
  'converted',
  'referral',
  'consultation',
];

async function postHandler(request: NextRequest) {
  const staffSession = await verifyStaffSession(request);
  const cronAuth = authCheck(request);
  if (!staffSession && !cronAuth) {
    return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { realtorId, revenueType, amount, serviceRequestId } = body as {
      realtorId?: string;
      revenueType?: string;
      amount?: number;
      serviceRequestId?: string;
    };

    if (!realtorId || !revenueType || amount == null) {
      return NextResponse.json(
        { error: 'realtorId, revenueType, amount 필요' },
        { status: 400 }
      );
    }
    if (!VALID_REVENUE_TYPES.includes(revenueType as RealtorRevenueType)) {
      return NextResponse.json(
        { error: `revenueType은 ${VALID_REVENUE_TYPES.join(', ')} 중 하나여야 합니다.` },
        { status: 400 }
      );
    }

    const result = await sendRealtorRevenueNotification({
      realtorId,
      revenueType: revenueType as RealtorRevenueType,
      amount: Number(amount),
      serviceRequestId: serviceRequestId ?? null,
    });

    if (result.skipped) {
      return NextResponse.json({ success: true, skipped: true, reason: result.reason });
    }
    return NextResponse.json({ success: result.success });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '발송 오류' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
