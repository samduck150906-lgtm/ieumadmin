import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { withErrorHandler } from '@/lib/api/error-handler';

function getSupabaseAdmin(): SupabaseClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

const LANDING_BASE_URL =
  process.env.NEXT_PUBLIC_LANDING_URL || 'https://ieum.in';

/** 파트너 본인의 초대 이력 조회 */
async function getHandler(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const { data: partner } = await supabaseAdmin
    .from('partners')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!partner) {
    return NextResponse.json({ error: '파트너 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const { data: invitations } = await supabaseAdmin
    .from('partner_invitations')
    .select('id, invitee_phone, invitee_name, invite_code, status, accepted_at, expires_at, sms_sent_at, created_at')
    .eq('partner_id', partner.id)
    .order('created_at', { ascending: false })
    .limit(50);

  return NextResponse.json({ data: invitations || [] });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));

/** 초대 문자 발송 */
async function postHandler(req: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();
  if (!supabaseAdmin) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: '인증이 필요합니다.' }, { status: 401 });
  }
  const token = authHeader.slice(7);

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const { data: partner } = await supabaseAdmin
    .from('partners')
    .select('id, business_name, form_link_code')
    .eq('user_id', user.id)
    .single();

  if (!partner) {
    return NextResponse.json({ error: '파트너 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const { phone, name } = body;

  if (!phone?.trim()) {
    return NextResponse.json({ error: '연락처를 입력하세요.' }, { status: 400 });
  }

  // 초대 코드 생성
  const inviteCode = Math.random().toString(36).substring(2, 12);

  // 만료일: 1년 후
  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 1);

  // 초대 링크
  const inviteLink = `${LANDING_BASE_URL}/realtor/apply?invite=${inviteCode}`;

  // SMS 메시지 생성
  const businessName = (partner.business_name as string) || '이음 파트너';
  const smsMessage = `[이음] ${businessName}에서 이음 앱에 초대합니다! 가입 시 추천인으로 자동 등록되어 수익 혜택을 받으실 수 있습니다.\n가입 링크: ${inviteLink}\n(유효기간: ${expiresAt.toLocaleDateString('ko-KR')})`;

  // DB에 초대 이력 저장
  const { data: invitation, error: insertError } = await supabaseAdmin
    .from('partner_invitations')
    .insert({
      partner_id: partner.id,
      invitee_phone: phone.trim(),
      invitee_name: name?.trim() || null,
      invite_code: inviteCode,
      status: 'sent',
      expires_at: expiresAt.toISOString(),
      sms_message: smsMessage,
      sms_sent_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: '초대 생성 실패: ' + insertError.message }, { status: 500 });
  }

  // 알리고 SMS 발송 (환경변수가 설정된 경우)
  const aligoApiKey = process.env.ALIGO_API_KEY;
  const aligoUserId = process.env.ALIGO_USER_ID;
  const aligoSender = process.env.ALIGO_SENDER;

  if (aligoApiKey && aligoUserId && aligoSender) {
    try {
      const formData = new URLSearchParams({
        key: aligoApiKey,
        user_id: aligoUserId,
        sender: aligoSender,
        receiver: phone.trim().replace(/-/g, ''),
        msg: smsMessage,
        msg_type: smsMessage.length > 90 ? 'LMS' : 'SMS',
      });

      await fetch('https://apis.aligo.in/send/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
      });
    } catch {
      // SMS 발송 실패해도 초대 이력은 저장됨
    }
  }

  return NextResponse.json({
    success: true,
    inviteCode,
    inviteLink,
    message: smsMessage,
    invitation,
  });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
