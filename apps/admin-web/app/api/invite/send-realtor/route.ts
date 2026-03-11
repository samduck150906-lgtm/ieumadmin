import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { sendSMS } from '@/lib/api/notifications';
import { generateReferralUrl } from '@/lib/qrcode';
import { withErrorHandler } from '@/lib/api/error-handler';
import { createCorsPreflightResponse, withCors } from '@/lib/api/cors';

/** 공인중개사 초대 문자 발송. 고정 문구 + 앱/회원가입 링크(추천인 자동). 공인중개사 전용 */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 오류' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const { phone } = body as { phone?: string };

  const phoneTrim = String(phone ?? '').replace(/\s/g, '').replace(/-/g, '');
  if (!phoneTrim || phoneTrim.length < 10) {
    return NextResponse.json(
      { error: '휴대폰 번호를 입력해 주세요.' },
      { status: 400 }
    );
  }

  try {
    const { data: realtor, error } = await supabase
      .from('realtors')
      .select('id, business_name')
      .eq('id', session.realtorId)
      .single();

    if (error || !realtor) {
      return NextResponse.json({ error: '공인중개사 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const businessName = (realtor as { business_name: string }).business_name;
    const referralLink = generateReferralUrl((realtor as { id: string }).id);
    const fullMessage = `"${businessName}"에서 초대 문자가 발송되었어요.
이음 솔루션에서 고객이 이사, 청소, 인터넷이전, 인테리어를 신청하면 자동으로 수익을 쉐어해드려요.
고객이 필요한 모든 상담은 이음에서 하며, 공인중개사님은 초대문자 발송버튼 한번만 눌러주세요.
고객당 평균 8만원 가량의 수익을 쉐어해드립니다. (24평 기준)

어플 다운로드 및 회원가입: ${referralLink}`;

    await sendSMS({
      phone: phoneTrim,
      message: fullMessage,
    });

    return NextResponse.json({
      success: true,
      message: '공인중개사 초대 문자가 발송되었습니다.',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '발송 실패' },
      { status: 500 }
    );
  }
}

export const OPTIONS = (request: Request) => createCorsPreflightResponse(request);
export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
