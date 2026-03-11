import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 가망고객 등록 건수·메시지 발송 누적 건수 (공인중개사 전용) */
async function getHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const [{ count: registeredCount }, { count: sentCount }] = await Promise.all([
      supabase.from('realtor_prospects').select('*', { count: 'exact', head: true }).eq('realtor_id', session.realtorId),
      supabase.from('realtor_prospect_sms_log').select('*', { count: 'exact', head: true }).eq('realtor_id', session.realtorId),
    ]);

    return NextResponse.json({
      totalCount: registeredCount ?? 0,
      messageSentCount: sentCount ?? 0,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
