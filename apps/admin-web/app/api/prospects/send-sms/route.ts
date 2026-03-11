import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { sendSMS } from '@/lib/notifications';
import { generateRealtorFormUrl } from '@/lib/qrcode';
import { checkRateLimit } from '@/lib/rate-limit';
import { parseJson } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

/** 가망고객 대상 SMS/LMS 발송 (공인중개사 전용) */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const rl = checkRateLimit(`prospects-send-sms:${session.realtorId}`, { max: 30, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: 'SMS 발송 요청이 너무 많습니다. 15분 후에 다시 시도해 주세요.' },
      { status: 429 }
    );
  }

  const parsed = await parseJson<{ prospect_ids?: string[]; direct_phones?: string[]; message?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const { prospect_ids, direct_phones, message: messageOverride } = body;

  const normalizedDirect = (direct_phones ?? [])
    .flatMap((p) => String(p).split(',').map((s) => s.replace(/\s/g, '').replace(/-/g, '')))
    .filter((p) => p.length >= 10);

  if (!(prospect_ids?.length || normalizedDirect.length)) {
    return NextResponse.json({ error: '수신 대상을 선택하거나 번호를 입력해 주세요.' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const { data: realtor } = await supabase
      .from('realtors')
      .select('id, business_name')
      .eq('id', session.realtorId)
      .single();

    const defaultMessage = `안녕하세요 "${(realtor as { business_name?: string })?.business_name || '이음'}입니다.\n이사, 청소, 인테리어, 인터넷이전 등 한번에 알아보실 수 있는 플랫폼이 있어 소개해 드립니다. 아래 링크에서 상담 신청해 주세요.`;
    const formLink = generateRealtorFormUrl(session.realtorId);
    const bodyText = messageOverride?.trim() || defaultMessage;
    const fullMessage = `${bodyText}\n\n폼 링크: ${formLink}`;

    const results: { id?: string; phone: string; success: boolean }[] = [];

    if (prospect_ids?.length) {
      const { data: prospects, error: fetchError } = await supabase
        .from('realtor_prospects')
        .select('id, name, phone')
        .eq('realtor_id', session.realtorId)
        .in('id', prospect_ids);

      if (fetchError || !prospects?.length) {
        return NextResponse.json({ error: '선택한 가망고객을 찾을 수 없습니다.' }, { status: 404 });
      }

      for (const p of prospects) {
        const phone = String((p as { phone?: string }).phone ?? '').replace(/\s/g, '').replace(/-/g, '');
        if (phone.length < 10) {
          results.push({ id: (p as { id: string }).id, phone, success: false });
          continue;
        }
        const { success } = await sendSMS({
          phone,
          name: (p as { name?: string }).name,
          message: fullMessage,
        });
        results.push({ id: (p as { id: string }).id, phone, success });
      }
    }

    for (const phone of normalizedDirect) {
      const { success } = await sendSMS({ phone, message: fullMessage });
      results.push({ phone, success });
    }

    const sent = results.filter((r) => r.success).length;
    if (sent > 0) {
      await supabase.from('realtor_prospect_sms_log').insert(
        Array.from({ length: sent }, () => ({ realtor_id: session.realtorId }))
      );
    }
    return NextResponse.json({
      success: true,
      sent,
      total: results.length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '발송 실패' },
      { status: 500 }
    );
  }
}

export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
