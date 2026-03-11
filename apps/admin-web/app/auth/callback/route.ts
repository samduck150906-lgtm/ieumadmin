import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** 역할별 리다이렉트 경로 (auth.tsx ROLE_REDIRECT_PATH와 동기화) */
const ROLE_REDIRECT_PATH: Record<string, string> = {
  admin: '/admin',
  staff: '/dashboard',
  partner: '/partner/dashboard',
  realtor: '/agent',
};

/** 허용된 리다이렉트 경로 (오픈 리다이렉트 방지) */
const ALLOWED_NEXT = ['/admin', '/dashboard', '/partner/dashboard', '/agent', '/affiliate', '/'];

function getAllowedNext(next: string | null): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/admin';
  const path = next.split('?')[0];
  if (
    ALLOWED_NEXT.includes(path) ||
    path.startsWith('/dashboard') ||
    path.startsWith('/partner/') ||
    path.startsWith('/agent') ||
    path.startsWith('/affiliate') ||
    path.startsWith('/admin')
  ) {
    return next;
  }
  return '/admin';
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const nextParam = searchParams.get('next');
  const next = getAllowedNext(nextParam);

  const origin = request.nextUrl.origin;
  const redirectSuccess = new URL(next, origin);
  const redirectError = new URL('/login', origin);

  // OAuth 에러 파라미터 처리 (카카오 KOE205, KOE006 등)
  const oauthError = searchParams.get('error');
  const oauthErrorDesc = searchParams.get('error_description');
  if (oauthError || oauthErrorDesc) {
    const msg = oauthErrorDesc || oauthError || 'oauth_error';
    redirectError.searchParams.set('error', msg);
    const isKoe006 = /KOE006|앱\s*관리자\s*설정/i.test(String(msg));
    if (isKoe006) redirectError.searchParams.set('error_code', 'KOE006');
    return NextResponse.redirect(redirectError);
  }

  // 기본 에러 메시지 (code 없음, exchange 실패 등)
  redirectError.searchParams.set('error', encodeURIComponent('로그인 인증에 실패했습니다. 다시 시도해 주세요.'));

  if (!supabaseUrl || !supabaseAnonKey) {
    redirectError.searchParams.set('error', encodeURIComponent('서버 설정이 완료되지 않았습니다. 관리자에게 문의해 주세요.'));
    return NextResponse.redirect(redirectError);
  }

  const response = NextResponse.redirect(redirectSuccess);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: { path?: string; maxAge?: number } = {}) {
        response.cookies.set(name, value, { path: options.path ?? '/', ...options });
      },
      remove(name: string, options: { path?: string } = {}) {
        response.cookies.set(name, '', { path: options.path ?? '/', maxAge: 0 });
      },
    },
  });

  if (code) {
    const kakaoSignupRole = searchParams.get('kakao_signup_role') as
      | 'partner'
      | 'realtor'
      | 'partner_apply'
      | null;

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const errMsg = error.message || '인증 코드 교환에 실패했습니다.';
      redirectError.searchParams.set('error', encodeURIComponent(errMsg));
      redirectError.searchParams.set('error_code', 'exchange_failed');
      return NextResponse.redirect(redirectError);
    }
    if (data?.user) {
      const { data: userRow, error: userError } = await supabase
        .from('users')
        .select('role')
        .eq('id', data.user.id)
        .single();

      // 카카오 회원가입 모드: role에 따른 추가정보 입력/신청 페이지로 리다이렉트
      const kakaoSignupPaths: Record<string, string> = {
        partner: '/members/partners/signup/kakao-complete',
        realtor: '/members/realtors/signup/kakao-complete',
        partner_apply: '/partner/apply',
      };
      if (kakaoSignupRole && kakaoSignupPaths[kakaoSignupRole]) {
        const signupPath = kakaoSignupPaths[kakaoSignupRole];
        const signupRedirect = new URL(signupPath, origin);
        const signupRes = NextResponse.redirect(signupRedirect);
        const setCookies = response.headers.getSetCookie?.() ?? [];
        setCookies.forEach((cookie) => signupRes.headers.append('Set-Cookie', cookie));
        return signupRes;
      }

      // 미가입 사용자: users 테이블에 없거나 허용 역할이 아니면 로그아웃 후 로그인 페이지로
      const allowedRoles = ['admin', 'staff', 'partner', 'realtor'];
      if (userError || !userRow || !allowedRoles.includes(userRow.role)) {
        await supabase.auth.signOut();
        const unregisteredUrl = new URL('/login', origin);
        unregisteredUrl.searchParams.set(
          'error',
          encodeURIComponent('등록된 계정이 아닙니다. 관리자 계정은 본사에 문의해 주세요. 제휴업체·공인중개사는 회원가입 후 이용해 주세요.')
        );
        unregisteredUrl.searchParams.set('error_code', 'not_registered');
        return NextResponse.redirect(unregisteredUrl);
      }

      // 역할별 전용 경로로 즉시 리다이렉트 (admin→/admin, staff→/dashboard, partner→/partner/dashboard, realtor→/agent)
      const rolePath = ROLE_REDIRECT_PATH[userRow.role];
      if (rolePath) {
        const roleRedirect = new URL(rolePath, origin);
        const roleRes = NextResponse.redirect(roleRedirect);
        const setCookies = response.headers.getSetCookie?.() ?? [];
        setCookies.forEach((cookie) => roleRes.headers.append('Set-Cookie', cookie));
        return roleRes;
      }

      return response;
    }
    // code는 있으나 data.user 없음
    redirectError.searchParams.set('error', encodeURIComponent('인증 정보를 가져오지 못했습니다. 다시 로그인해 주세요.'));
  }

  return NextResponse.redirect(redirectError);
}
