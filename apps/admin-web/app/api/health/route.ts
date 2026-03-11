import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { withErrorHandler } from '@/lib/api/error-handler';

/**
 * 헬스체크 엔드포인트 (배포·모니터링용)
 * - createServerClient()와 동일 조건으로 env 검사 (trim, 플레이스홀더 제외)
 * - 인증 불필요 (업타임 모니터링 도구에서 직접 호출)
 */
async function getHandler(_request: Request) {
  const supabase = createServerClient();
  const supabaseConfigured = !!supabase;

  let dbStatus: 'ok' | 'error' | 'not_configured' = 'not_configured';
  if (supabase) {
    try {
      const { error } = await supabase.from('staff').select('id').limit(1);
      dbStatus = error ? 'error' : 'ok';
    } catch {
      dbStatus = 'error';
    }
  }

  const healthy = supabaseConfigured && dbStatus === 'ok';

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || '';
  const authCallbackBase =
    siteUrl && !siteUrl.includes('supabase.co') && !siteUrl.includes('ieumm')
      ? siteUrl.replace(/\/$/, '')
      : 'https://ieum2.netlify.app';

  return NextResponse.json(
    {
      status: healthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      env: {
        supabase: supabaseConfigured ? 'configured' : 'missing',
        sentry: !!process.env.SENTRY_DSN ? 'configured' : 'missing',
      },
      db: dbStatus,
      /** Supabase Redirect URLs에 이 주소가 등록되어 있어야 카카오 로그인 후 올바르게 리다이렉트됨 */
      expectedAuthCallbackUrl: `${authCallbackBase}/auth/callback`,
      ...(healthy ? {} : { hint: '자세한 원인: GET /api/debug/supabase-env 호출' }),
    },
    { status: healthy ? 200 : 503 }
  );
}

export const GET = withErrorHandler((request: Request) => getHandler(request));
