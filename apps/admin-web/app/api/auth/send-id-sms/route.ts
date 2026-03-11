/**
 * 아이디 찾기 — 휴대폰 번호로 가입 이메일을 문자로 발송 (기획 No.3)
 * 비인증 호출 가능 (모바일 앱 로그인 전 화면에서 사용)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendSms } from '@/lib/alimtalk';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { parseJson } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';

function normalizePhone(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

async function postHandler(request: NextRequest) {
  const id = getClientIdentifier(request);
  const rl = checkRateLimit(`send-id-sms:${id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 15분 후에 다시 시도해 주세요.' },
      { status: 429 }
    );
  }

  const parsed = await parseJson<{ phone?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const normalized = normalizePhone(phone);

  if (normalized.length < 10 || normalized.length > 11) {
    return NextResponse.json(
      { error: 'invalid_phone', message: '전화번호를 올바르게 입력해 주세요.' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  // users + realtors 조인으로 해당 전화번호와 일치하는 이메일 1건 조회 (서버 전용)
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email, phone, realtors(contact_phone)')
    .not('email', 'is', null);

  if (usersError) {
    console.error('[send-id-sms] users 조회 실패:', usersError);
    return NextResponse.json({ error: '조회 실패' }, { status: 500 });
  }

  type Row = { email: string; phone?: string; realtors?: { contact_phone?: string } | { contact_phone?: string }[] | null };
  let foundEmail: string | null = null;
  for (const u of (users || []) as Row[]) {
    const userPhone = normalizePhone(u.phone || '');
    const r = u.realtors;
    const contactPhone = r
      ? normalizePhone(
          (Array.isArray(r) ? r[0]?.contact_phone : (r as { contact_phone?: string }).contact_phone) || ''
        )
      : '';
    if (userPhone === normalized || contactPhone === normalized) {
      foundEmail = u.email;
      break;
    }
  }

  if (!foundEmail) {
    return NextResponse.json(
      { error: 'not_found', message: '해당 전화번호로 가입된 아이디가 없습니다.' },
      { status: 404 }
    );
  }

  const message = `[이음] 아이디 찾기 결과입니다.\n아이디(이메일): ${foundEmail}`;
  const { success, error } = await sendSms({
    phone: normalized,
    message,
  });

  if (!success) {
    return NextResponse.json(
      { error: 'send_failed', message: error || '문자 발송에 실패했습니다.' },
      { status: 502 }
    );
  }

  // 발송 로그 저장 (선택)
  try {
    await supabase.from('notification_logs').insert({
      recipient_phone: normalized,
      notification_type: 'find_id_sms',
      channel: 'sms',
      message_content: message,
      is_sent: true,
      sent_at: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[send-id-sms] 로그 기록 실패:', e);
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
