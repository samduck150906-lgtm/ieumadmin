import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { sendAlimtalk } from '@/lib/alimtalk';
import { generateRealtorFormUrl } from '@/lib/qrcode';
import { NOTIFICATION_TEMPLATES } from '@/lib/notification-templates';
import { checkRateLimit } from '@/lib/rate-limit';
import { parseJson } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 가망고객 대상 Kakao 알림톡 발송 (공인중개사 전용) */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const rl = checkRateLimit(`prospects-send-alimtalk:${session.realtorId}`, { max: 30, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: '알림톡 발송 요청이 너무 많습니다. 15분 후에 다시 시도해 주세요.' },
      { status: 429 }
    );
  }

  const parsed = await parseJson<{
    prospect_ids?: string[];
    direct_phones?: string[];
    template_code?: string;
    template_variables?: Record<string, string>;
  }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const { prospect_ids, direct_phones, template_code: clientTemplateCode, template_variables: clientVariables } = body;

  const fromProspects = Array.isArray(prospect_ids) && prospect_ids.length > 0;
  const fromDirect = Array.isArray(direct_phones) && direct_phones.length > 0;
  if (!fromProspects && !fromDirect) {
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
    const businessName = (realtor as { business_name?: string } | null)?.business_name || '이음';
    const formLink = generateRealtorFormUrl(session.realtorId);
    const defaultTemplate = NOTIFICATION_TEMPLATES.REALTOR_PROSPECT_ALIMTALK;
    const templateCode = clientTemplateCode?.trim() || defaultTemplate.templateCode;
    const template = { ...defaultTemplate, templateCode };
    const fallbackMessage = template.buildMessage({
      name: '고객',
      business_name: businessName,
      form_link: formLink,
    });

    type Recipient = { phone: string; name: string };
    let recipients: Recipient[] = [];

    if (fromProspects) {
      const { data: prospects, error: fetchError } = await supabase
        .from('realtor_prospects')
        .select('id, name, phone')
        .eq('realtor_id', session.realtorId)
        .in('id', prospect_ids);
      if (fetchError || !prospects?.length) {
        return NextResponse.json({ error: '선택한 가망고객을 찾을 수 없습니다.' }, { status: 404 });
      }
      recipients = (prospects as { id: string; name?: string; phone: string }[]).map((p) => ({
        phone: String(p.phone).replace(/\s/g, '').replace(/-/g, ''),
        name: p.name?.trim() || '고객',
      }));
    } else {
      const phones = direct_phones ?? [];
      recipients = phones
        .map((p: string) => String(p).replace(/\s/g, '').replace(/-/g, ''))
        .filter((p: string) => p.length >= 10)
        .map((phone: string) => ({ phone, name: '고객' }));
      if (recipients.length === 0) {
        return NextResponse.json({ error: '올바른 휴대번호를 1개 이상 입력해 주세요.' }, { status: 400 });
      }
    }

    const results: { phone: string; success: boolean }[] = [];
    for (const r of recipients) {
      const baseVars = { name: r.name, business_name: businessName, form_link: formLink };
      const variables = { ...baseVars, ...(clientVariables ?? {}) };
      const { success } = await sendAlimtalk({
        phone: r.phone,
        templateCode: template.templateCode,
        variables,
        fallbackMessage,
      });
      results.push({ phone: r.phone, success });
    }

    const sent = results.filter((x) => x.success).length;
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

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
