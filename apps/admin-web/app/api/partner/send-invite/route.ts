/**
 * 파트너 초대 문자 발송 API
 * - 전화번호 입력 → 초대 코드 생성 → SMS 발송 → partner_invitations 기록
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import { sendSms } from '@/lib/alimtalk';
import { withErrorHandler } from '@/lib/api/error-handler';

async function postHandler(request: NextRequest) {
  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  if (!partnerId) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  let body: { phone: string; name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone = body.phone?.replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    return NextResponse.json({ error: '올바른 전화번호를 입력하세요.' }, { status: 400 });
  }

  // 파트너 정보 조회 (업체명, form_link_code)
  const { data: partner } = await supabase
    .from('partners')
    .select('id, business_name, form_link_code')
    .eq('id', partnerId)
    .single();

  if (!partner) {
    return NextResponse.json({ error: '업체 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  // form_link_code 없으면 생성
  let formLinkCode: string = partner.form_link_code ?? '';
  if (!formLinkCode) {
    const newCode = Math.random().toString(36).slice(2, 14);
    await supabase.from('partners').update({ form_link_code: newCode }).eq('id', partnerId);
    formLinkCode = newCode;
  }

  // 초대 이력 생성 (invite_code는 DB 기본값으로 자동 생성)
  const { data: invitation, error: insertErr } = await supabase
    .from('partner_invitations')
    .insert({
      partner_id: partnerId,
      invitee_phone: phone,
      invitee_name: body.name?.trim() || null,
    })
    .select('id, invite_code')
    .single();

  if (insertErr || !invitation) {
    return NextResponse.json({ error: '초대 이력 생성 실패: ' + (insertErr?.message ?? '알 수 없는 오류') }, { status: 500 });
  }

  // 랜딩 페이지 URL 구성
  const baseUrl = process.env.NEXT_PUBLIC_LANDING_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum.in';
  const inviteUrl = `${baseUrl}/realtor/apply?invite=${invitation.invite_code}`;

  // SMS 발송
  const businessName = partner.business_name || '이음 파트너스';
  const message = `[이음] ${businessName}에서 공인중개사님을 초대했습니다.\n이음 플랫폼 가입 후 수익을 창출해 보세요!\n가입 링크: ${inviteUrl}\n(링크 유효기간 1년)`;

  let smsSent = false;
  try {
    await sendSms({ phone, message });
    smsSent = true;
    // SMS 발송 시각 기록
    await supabase
      .from('partner_invitations')
      .update({ sms_sent_at: new Date().toISOString(), sms_message: message })
      .eq('id', invitation.id);
  } catch (smsErr) {
    smsSent = false;
    // SMS 실패 시 초대 이력은 유지하되 실패 사실을 기록
    console.error('SMS 발송 실패:', smsErr);
    await supabase
      .from('partner_invitations')
      .update({ sms_message: message })
      .eq('id', invitation.id);
  }

  return NextResponse.json({
    success: true,
    smsSent,
    inviteCode: invitation.invite_code,
    inviteUrl,
  });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
