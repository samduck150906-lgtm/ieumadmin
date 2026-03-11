import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { generateRealtorFormUrl } from '@/lib/qrcode';
import { checkRateLimit } from '@/lib/rate-limit';
import { parseJson } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';

/**
 * 가망고객 대상 카카오 알림톡 발송 (공인중개사 전용)
 * 알림톡 템플릿 연동 전까지는 SMS와 동일 본문으로 발송 시도 후, 성공 시 prospect_sms_sent_count 누적.
 */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const rl = checkRateLimit(`prospects-send-kakao:${session.realtorId}`, { max: 30, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: '알림톡 발송 요청이 너무 많습니다. 15분 후에 다시 시도해 주세요.' },
      { status: 429 }
    );
  }

  const parsed = await parseJson<{ prospect_ids?: string[]; message?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const { prospect_ids, message: messageOverride } = body;

  if (!prospect_ids?.length) {
    return NextResponse.json({ error: '수신 대상을 선택해 주세요.' }, { status: 400 });
  }

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const { data: prospects, error: fetchError } = await supabase
      .from('realtor_prospects')
      .select('id, name, phone')
      .eq('realtor_id', session.realtorId)
      .in('id', prospect_ids);

    if (fetchError || !prospects?.length) {
      return NextResponse.json({ error: '선택한 가망고객을 찾을 수 없습니다.' }, { status: 404 });
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

    // 카카오 알림톡 API 연동 전: SMS 발송 모듈로 대체 (동일 본문). 연동 후 알림톡 템플릿 호출로 교체.
    const { sendSMS } = await import('@/lib/notifications');
    const results: { id: string; phone: string; success: boolean }[] = [];
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

    const sent = results.filter(r => r.success).length;
    if (sent > 0) {
      const { data: row } = await supabase
        .from('realtors')
        .select('prospect_sms_sent_count')
        .eq('id', session.realtorId)
        .single();
      const current = (row as { prospect_sms_sent_count?: number } | null)?.prospect_sms_sent_count ?? 0;
      await supabase
        .from('realtors')
        .update({ prospect_sms_sent_count: current + sent, updated_at: new Date().toISOString() })
        .eq('id', session.realtorId);
    }

    return NextResponse.json({
      success: true,
      sent,
      total: results.length,
      results,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '카카오 발송 실패' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
