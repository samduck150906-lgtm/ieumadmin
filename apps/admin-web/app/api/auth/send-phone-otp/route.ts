/**
 * 휴대폰 번호 변경 — 인증번호 발송 (기획: 변경 번호 입력 → 인증번호 받기 → OTP 입력 → 확인)
 * 공인중개사 로그인 필요.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createClient } from '@supabase/supabase-js';
import { sendSms } from '@/lib/alimtalk';
import { checkRateLimit } from '@/lib/rate-limit';
import { parseJson } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function normalizePhone(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const rl = checkRateLimit(`send-phone-otp:${session.userId}`, { max: 10, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: '인증번호 요청이 너무 많습니다. 15분 후에 다시 시도해 주세요.' },
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

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  const { error: insertErr } = await supabase.from('phone_verification_otp').insert({
    user_id: session.userId,
    phone: normalized,
    code,
    expires_at: expiresAt,
  });
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  const message = `[이음] 휴대폰 인증번호입니다. [${code}] (5분 내 입력)`;
  const { success, error: smsErr } = await sendSms({ phone: normalized, message });
  if (!success) {
    return NextResponse.json(
      { error: 'send_failed', message: smsErr || '인증번호 발송에 실패했습니다.' },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}

export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
