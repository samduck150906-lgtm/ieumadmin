import { NextResponse } from 'next/server';
import { createServerClient, getServerClientErrorHint } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * Supabase 환경변수 진단 (회원가입 서버 설정 오류 원인 확인용)
 * 브라우저에서 /api/debug/supabase-env 호출 시 어떤 항목이 비었는지 확인 가능.
 * 실제 키 값은 노출하지 않음.
 */
async function getHandler(_request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';

  const urlSet = url.length > 0 && !url.includes('your-project');
  const serviceKeySet = serviceKey.length >= 20;
  const placeholder =
    !serviceKeySet ||
    /your-service-role-key|placeholder-service-role-key|your-project\.supabase\.co/i.test(
      serviceKey
    );

  const client = createServerClient();
  const ok = !!client && urlSet && serviceKeySet && !placeholder;
  const hint = ok ? '설정은 되어 있습니다. 회원가입 시 여전히 오류면 키가 만료/폐기되었을 수 있습니다.' : getServerClientErrorHint();

  return NextResponse.json(
    {
      ok,
      urlSet,
      serviceKeySet,
      keyLength: serviceKey.length,
      placeholder,
      clientCreated: !!client,
      hint,
      message: ok
        ? 'Supabase 서버 설정이 정상입니다.'
        : `서버 설정 오류. ${hint}`,
    },
    { status: ok ? 200 : 503 }
  );
}

export const GET = withErrorHandler((request) => getHandler(request));
