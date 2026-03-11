/**
 * 관리자 공인중개사 초대 API
 * - 휴대폰번호 입력 → 초대 문자 발송 → admin_realtor_invitations 기록
 * - 추천인(referrer_realtor_id) 지정 시 가입 시 자동 등록
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { sendSMS } from '@/lib/api/notifications';
import { withErrorHandler } from '@/lib/api/error-handler';

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  let body: { phone: string; name?: string; referrer_realtor_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const phone = body.phone?.replace(/\D/g, '');
  if (!phone || phone.length < 10) {
    return NextResponse.json({ error: '올바른 휴대폰 번호를 입력하세요.' }, { status: 400 });
  }

  const referrerRealtorId = body.referrer_realtor_id?.trim() || null;

  // 추천인 유효성 검사
  if (referrerRealtorId) {
    const { data: refRealtor } = await supabase
      .from('realtors')
      .select('id')
      .eq('id', referrerRealtorId)
      .single();
    if (!refRealtor) {
      return NextResponse.json({ error: '지정한 추천인(공인중개사)을 찾을 수 없습니다.' }, { status: 400 });
    }
  }

  const inviteCode = Math.random().toString(36).substring(2, 12);
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  const landingUrl =
    process.env.NEXT_PUBLIC_LANDING_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://ieum.in';
  const inviteUrl = `${landingUrl.replace(/\/$/, '')}/realtor/apply?invite=${inviteCode}`;

  const smsMessage = `[이음] 이음 플랫폼에서 공인중개사님을 초대합니다!
가입 시 추천인으로 자동 등록되어 1년간 수익 혜택을 받으실 수 있습니다.
가입 링크: ${inviteUrl}
(유효기간: ${expiresAt.toLocaleDateString('ko-KR')})`;

  const { data: invitation, error: insertErr } = await supabase
    .from('admin_realtor_invitations')
    .insert({
      invite_code: inviteCode,
      invitee_phone: phone,
      invitee_name: body.name?.trim() || null,
      referrer_realtor_id: referrerRealtorId,
      status: 'sent',
      expires_at: expiresAt.toISOString(),
      created_by: session.userId,
    })
    .select('id')
    .single();

  if (insertErr || !invitation) {
    return NextResponse.json({
      error: '초대 이력 생성 실패: ' + (insertErr?.message ?? '알 수 없는 오류'),
    }, { status: 500 });
  }

  let smsSent = false;
  try {
    const result = await sendSMS({
      phone,
      message: smsMessage,
    });
    smsSent = result.success;
    await supabase
      .from('admin_realtor_invitations')
      .update({
        sms_sent_at: new Date().toISOString(),
        sms_message: smsMessage,
      })
      .eq('id', invitation.id);
  } catch (smsErr) {
    console.error('SMS 발송 실패:', smsErr);
  }

  return NextResponse.json({
    success: true,
    smsSent,
    inviteCode,
    inviteUrl,
    message: smsSent ? '초대 문자가 발송되었습니다.' : '초대 이력은 저장되었으나 문자 발송에 실패했습니다.',
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
