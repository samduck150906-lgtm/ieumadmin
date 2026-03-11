import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/api/error-handler';

/** SMS 발신번호 / 수신거부번호 (앱 표시용, 공인중개사 전용) */
async function getHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor') {
    return unauthorizedResponse();
  }

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const { data: settings } = await supabase
      .from('site_settings')
      .select('sms_sender_number, sms_opt_out_number')
      .limit(1)
      .maybeSingle();

    const row = settings as { sms_sender_number?: string | null; sms_opt_out_number?: string | null } | null;
    const senderNumber = row?.sms_sender_number?.trim() || process.env.ALIGO_SENDER || null;
    const optOutNumber = row?.sms_opt_out_number?.trim() || null;

    return NextResponse.json({
      senderNumber: senderNumber || null,
      optOutNumber: optOutNumber || null,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
