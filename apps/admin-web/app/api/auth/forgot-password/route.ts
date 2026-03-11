import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendSMS } from '@/lib/notifications';
import { checkRateLimit, getClientIdentifier } from '@/lib/rate-limit';
import { parseJson } from '@/lib/api/parse-body';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

/** 비밀번호 찾기: 이름+휴대폰 일치 시 임시 비밀번호 생성·저장 후 문자 발송. 공개 API(인증 불필요). */
async function postHandler(request: NextRequest) {
  const id = getClientIdentifier(request);
  const rl = checkRateLimit(`forgot-password:${id}`, { max: 5, windowMs: 15 * 60 * 1000 });
  if (!rl.allowed) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 15분 후에 다시 시도해 주세요.' },
      { status: 429, headers: rl.retryAfterMs ? { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } : undefined }
    );
  }

  const parsed = await parseJson<{ name?: string; phone?: string }>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const nameRaw = typeof body.name === 'string' ? body.name.trim() : '';
  const phoneRaw = typeof body.phone === 'string' ? body.phone : '';
  const phoneNormalized = phoneRaw.replace(/\D/g, '');

  // 요구사항 3: 이름 Validation → "올바른 이름을 입력하세요"
  if (nameRaw.length < 2) {
    return NextResponse.json(
      { success: false, error: '올바른 이름을 입력하세요.', field: 'name' },
      { status: 400 }
    );
  }

  // 요구사항 4: 휴대폰 Validation → "휴대폰번호를 잘못 입력하셨습니다."
  if (phoneNormalized.length < 10 || phoneNormalized.length > 11) {
    return NextResponse.json(
      { success: false, error: '휴대폰번호를 잘못 입력하셨습니다.', field: 'phone' },
      { status: 400 }
    );
  }

  try {
    const { data: userId, error: rpcError } = await supabase.rpc('find_user_id_by_name_and_phone', {
      p_name: nameRaw,
      p_phone: phoneNormalized,
    });

    if (rpcError) {
      console.error('[forgot-password] RPC error:', rpcError);
      return NextResponse.json({ error: '조회 중 오류가 발생했습니다.' }, { status: 500 });
    }

    // 요구사항 8: 일치하는 사용자 없음 → not_found (클라이언트에서 Toast "일치하는 사용자 정보를 찾을 수 없습니다.")
    if (!userId) {
      return NextResponse.json({ success: false, code: 'not_found' }, { status: 200 });
    }

    // 임시 비밀번호 생성 (8자, 영문+숫자)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let tempPassword = '';
    const randomBytes = new Uint8Array(8);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      crypto.getRandomValues(randomBytes);
      for (let i = 0; i < 8; i++) tempPassword += chars[randomBytes[i]! % chars.length];
    } else {
      tempPassword = Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    }

    const { error: updateError } = await supabase.auth.admin.updateUserById(userId as string, {
      password: tempPassword,
    });

    if (updateError) {
      console.error('[forgot-password] updateUserById error:', updateError);
      return NextResponse.json({ error: '비밀번호 초기화에 실패했습니다.' }, { status: 500 });
    }

    // 요구사항 5·6: 문자로 임시 비밀번호 발송
    const smsMessage = `[이음] 임시 비밀번호: ${tempPassword}\n전송 받은 임시 비밀번호로 로그인해 주세요.`;
    const smsResult = await sendSMS({
      phone: phoneNormalized,
      name: nameRaw,
      message: smsMessage,
    });

    if (!smsResult.success) {
      console.warn('[forgot-password] SMS 발송 실패. ALIGO_API_KEY, ALIGO_USER_ID, ALIGO_SENDER 설정을 확인하세요.');
      return NextResponse.json(
        {
          success: false,
          error: '문자 발송에 실패했습니다. SMS 설정(알리고 API)이 필요합니다. 관리자에게 문의해 주세요.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('[forgot-password]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}

export const POST = withCors(withErrorHandler((request: Request) => postHandler(request as NextRequest)));
