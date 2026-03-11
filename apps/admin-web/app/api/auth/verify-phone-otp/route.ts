/**
 * 휴대폰 번호 변경 — 인증번호 확인 후 연락처/본인인증 정보 갱신 (기획 No.3, 7)
 * 공인중개사 로그인 필요.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createClient } from '@supabase/supabase-js';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function normalizePhone(phone: string): string {
  return (phone || '').replace(/\D/g, '');
}

async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse();
  }

  const body = await request.json().catch(() => ({}));
  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const code = typeof body.code === 'string' ? body.code.replace(/\D/g, '').trim() : '';
  const normalized = normalizePhone(phone);

  if (normalized.length < 10 || normalized.length > 11) {
    return NextResponse.json(
      { error: 'invalid_phone', message: '전화번호를 올바르게 입력해 주세요.' },
      { status: 400 }
    );
  }
  if (code.length < 4) {
    return NextResponse.json(
      { error: 'invalid_code', message: '인증번호를 입력해 주세요.' },
      { status: 400 }
    );
  }

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  const { data: row, error: findErr } = await supabase
    .from('phone_verification_otp')
    .select('id')
    .eq('user_id', session.userId)
    .eq('phone', normalized)
    .eq('code', code)
    .gt('expires_at', new Date().toISOString())
    .limit(1)
    .maybeSingle();

  if (findErr || !row) {
    return NextResponse.json(
      { error: 'invalid_code', message: '인증번호가 일치하지 않거나 만료되었습니다.' },
      { status: 400 }
    );
  }

  await supabase.from('phone_verification_otp').delete().eq('id', row.id);

  const now = new Date().toISOString();
  const { error: userErr } = await supabase
    .from('users')
    .update({ phone: normalized, updated_at: now })
    .eq('id', session.userId);
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 500 });
  }

  const { error: realtorErr } = await supabase
    .from('realtors')
    .update({
      contact_phone: normalized,
      verified_phone: normalized,
      phone_verified_at: now,
      updated_at: now,
    })
    .eq('id', session.realtorId);
  if (realtorErr) {
    return NextResponse.json({ error: realtorErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
