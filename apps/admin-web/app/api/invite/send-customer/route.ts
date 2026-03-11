import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { sendSMS } from '@/lib/api/notifications';
import { generateRealtorFormUrl } from '@/lib/qrcode';
import { withErrorHandler } from '@/lib/api/error-handler';
import { createCorsPreflightResponse, withCors } from '@/lib/api/cors';

/** 고객에게 폼메일 링크 포함 문구 발송 (SMS). 공인중개사 전용 */
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
  const { phone, name, messageOverride } = body as {
    phone?: string;
    name?: string;
    messageOverride?: string;
  };

  const phoneTrim = String(phone ?? '').replace(/\s/g, '').replace(/-/g, '');
  if (!phoneTrim || phoneTrim.length < 10) {
    return NextResponse.json(
      { error: '수신자 전화번호를 입력해 주세요.' },
      { status: 400 }
    );
  }

  try {
    const [realtorRes, settingsRes] = await Promise.all([
      supabase
        .from('realtors')
        .select('id, business_name, custom_invite_message')
        .eq('id', session.realtorId)
        .single(),
      supabase.from('site_settings').select('default_invite_message').limit(1).maybeSingle(),
    ]);
    const settings = settingsRes.data;

    if (realtorRes.error || !realtorRes.data) {
      return NextResponse.json({ error: '공인중개사 정보를 찾을 수 없습니다.' }, { status: 404 });
    }

    const realtor = realtorRes.data as {
      id: string;
      business_name: string;
      custom_invite_message: string | null;
    };
    const defaultMessage =
      settings?.default_invite_message ||
      '안녕하세요 "부동산명"입니다.\n이사, 청소, 인테리어, 인터넷이전등 한번에 알아보실 수 있는 플렛폼이 있어서 소개해 드리려고 연락드렸습니다.\n혜택이 좋은편이니 한번 상담받아보세요.';
    const bodyText = messageOverride ?? realtor.custom_invite_message ?? defaultMessage;
    const messageBody = bodyText.replace(/"부동산명"/g, `"${realtor.business_name}"`);
    const formLink = generateRealtorFormUrl(realtor.id);
    const fullMessage = `${messageBody}\n\n-폼메일 링크-\n${formLink}`;

    await sendSMS({
      phone: phoneTrim,
      name: name ?? undefined,
      message: fullMessage,
    });

    return NextResponse.json({
      success: true,
      message: '고객 초대 문자가 발송되었습니다.',
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
