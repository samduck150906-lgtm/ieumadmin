import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  AUTH_CALLBACK_PATH,
  isAdminOnlyRoute,
  isAgentOnlyRoute,
  isAffiliateOnlyRoute,
  isLoginPath,
  isPartnerAllowedPath,
  isPartnerOnlyRoute,
  isProtectedRoute,
} from '@/lib/middleware-routes';
import { createCorsPreflightResponse } from '@/lib/api/cors';

function createRedirect(urlPath: string, request: NextRequest): URL {
  const url = new URL(urlPath, request.url);
  url.search = ['/dashboard', '/partner/dashboard', '/agent/dashboard'].includes(urlPath) ? '' : request.nextUrl.search;
  return url;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const response = NextResponse.next({ request });

  // API 라우트 — CORS preflight 처리 후 인증/리다이렉트 로직 건너뛰고 통과
  if (pathname.startsWith('/api/')) {
    if (request.method === 'OPTIONS') {
      return createCorsPreflightResponse(request);
    }
    return response;
  }

  // 보안 헤더
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

    if (!supabaseUrl || !supabaseAnonKey) {
      const missing: string[] = [];
      if (!supabaseUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
      if (!supabaseAnonKey) missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY');
      console.warn(
        `⚠️ [admin-web middleware] Supabase 환경변수 누락: ${missing.join(', ')}. 인증이 비활성화됩니다. .env.local 또는 배포 대시보드에서 설정 후 재시작/재배포하세요.`
      );
      if (isProtectedRoute(pathname)) {
        return NextResponse.redirect(createRedirect('/login', request));
      }
      return response;
    }

    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options?: Parameters<NextResponse['cookies']['set']>[2]) {
          response.cookies.set(name, value, {
            path: options?.path ?? '/',
            ...(options ?? {}),
          });
        },
        remove(name: string, options?: { path?: string }) {
          response.cookies.set(name, '', {
            path: options?.path ?? '/',
            maxAge: 0,
          });
        },
      },
    });

      // getUser()는 서버에서 JWT를 직접 검증 — getSession()보다 보안적으로 안전
    let authUser: { id: string } | null = null;
    try {
      const result = await Promise.race([
        supabase.auth.getUser(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('AUTH_TIMEOUT')), 8_000)
        ),
      ]);
      authUser = result.data.user ?? null;
    } catch {
      authUser = null;
    }
    const hasSession = Boolean(authUser);

    if (pathname === AUTH_CALLBACK_PATH || pathname.startsWith(`${AUTH_CALLBACK_PATH}/`)) {
      return response;
    }

    // 루트(/) 접근 시 로그인된 사용자는 role에 따라 역할별 기본 페이지로 리다이렉트
    if (pathname === '/' && hasSession && authUser) {
      try {
        const { data: userData, error: roleError } = await supabase
          .from('users')
          .select('role')
          .eq('id', authUser.id)
          .single();
        if (roleError || !userData?.role) {
          await supabase.auth.signOut();
          const loginUrl = new URL('/login', request.url);
          loginUrl.searchParams.set('error', encodeURIComponent('역할 정보를 확인할 수 없습니다. 다시 로그인해 주세요.'));
          loginUrl.searchParams.set('error_code', 'role_lookup');
          const redirectRes = NextResponse.redirect(loginUrl);
          // signOut이 설정한 쿠키를 응답에 반영
          const setCookies = response.headers.getSetCookie?.() ?? [];
          setCookies.forEach((c) => redirectRes.headers.append('Set-Cookie', c));
          return redirectRes;
        }
        const role = userData.role;
        if (role === 'admin') {
          return NextResponse.redirect(createRedirect('/admin', request));
        }
        if (role === 'staff') {
          return NextResponse.redirect(createRedirect('/dashboard', request));
        }
        if (role === 'realtor') {
          return NextResponse.redirect(createRedirect('/agent/dashboard', request));
        }
        if (role === 'partner') {
          return NextResponse.redirect(createRedirect('/partner/dashboard', request));
        }
        return NextResponse.redirect(createRedirect('/admin', request));
      } catch (err) {
        await supabase.auth.signOut();
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', encodeURIComponent('역할 정보를 불러오는 중 오류가 발생했습니다. 다시 로그인해 주세요.'));
        loginUrl.searchParams.set('error_code', 'role_lookup');
        const redirectRes = NextResponse.redirect(loginUrl);
        const setCookies = response.headers.getSetCookie?.() ?? [];
        setCookies.forEach((c) => redirectRes.headers.append('Set-Cookie', c));
        return redirectRes;
      }
    }

    // 비로그인 상태로 보호 경로 접근 시 로그인 페이지로
    if (isProtectedRoute(pathname) && !hasSession) {
      return NextResponse.redirect(createRedirect('/login', request));
    }

    // 이미 로그인된 상태로 로그인 페이지 접근 시: role에 따라 분기
    if (isLoginPath(pathname) && hasSession && authUser) {
      try {
        const { data: userData, error: roleError } = await supabase
          .from('users')
          .select('role')
          .eq('id', authUser.id)
          .single();
        if (roleError || !userData?.role) {
          await supabase.auth.signOut();
          const loginUrl = new URL('/login', request.url);
          loginUrl.searchParams.set('error', encodeURIComponent('역할 정보를 확인할 수 없습니다. 다시 로그인해 주세요.'));
          loginUrl.searchParams.set('error_code', 'role_lookup');
          const redirectRes = NextResponse.redirect(loginUrl);
          const setCookies = response.headers.getSetCookie?.() ?? [];
          setCookies.forEach((c) => redirectRes.headers.append('Set-Cookie', c));
          return redirectRes;
        }
        const role = userData.role;
        if (role === 'admin') {
          return NextResponse.redirect(createRedirect('/admin', request));
        }
        if (role === 'staff') {
          return NextResponse.redirect(createRedirect('/dashboard', request));
        }
        if (role === 'realtor') {
          return NextResponse.redirect(createRedirect('/agent/dashboard', request));
        }
        if (role === 'partner') {
          return NextResponse.redirect(createRedirect('/partner/dashboard', request));
        }
      } catch {
        await supabase.auth.signOut();
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('error', encodeURIComponent('역할 정보를 불러오는 중 오류가 발생했습니다. 다시 로그인해 주세요.'));
        loginUrl.searchParams.set('error_code', 'role_lookup');
        const redirectRes = NextResponse.redirect(loginUrl);
        const setCookies = response.headers.getSetCookie?.() ?? [];
        setCookies.forEach((c) => redirectRes.headers.append('Set-Cookie', c));
        return redirectRes;
      }
      return NextResponse.redirect(createRedirect('/admin', request));
    }

    // /affiliate/* — 제휴업체(partner) 전용. partner는 /affiliate/dashboard 접근 허용 (AFFILIATE_NAV_ITEMS 링크)
    // (기존: partner를 /partner/dashboard로 리다이렉트 → /affiliate/dashboard 직접 접근 시 404 가능성 제거)

    // 세션이 있는 경우 role 기반 경로 보호: /admin, /agent, /affiliate, /partner
    const roleProtected =
      hasSession &&
      authUser &&
      (isAdminOnlyRoute(pathname) ||
        isPartnerOnlyRoute(pathname) ||
        isAgentOnlyRoute(pathname) ||
        isAffiliateOnlyRoute(pathname));

    if (roleProtected && authUser) {
      try {
        const { data: userData } = await supabase
          .from('users')
          .select('role')
          .eq('id', authUser.id)
          .single();
        const role = userData?.role;

        // 공인중개사(realtor)가 관리자 전용 경로에 접근 시 → /agent/dashboard
        if (role === 'realtor' && isAdminOnlyRoute(pathname)) {
          return NextResponse.redirect(createRedirect('/agent/dashboard', request));
        }
        // 제휴업체(partner)가 관리자 전용 경로에 접근 시 → /partner/dashboard
        if (role === 'partner' && isAdminOnlyRoute(pathname)) {
          return NextResponse.redirect(createRedirect('/partner/dashboard', request));
        }

        // 제휴업체(partner)가 허용되지 않은 /partner/* 경로 접근 시 → /partner/dashboard
        if (role === 'partner' && pathname.startsWith('/partner') && !isPartnerAllowedPath(pathname)) {
          return NextResponse.redirect(createRedirect('/partner/dashboard', request));
        }

        // 관리자·스태프가 파트너 전용 경로에 접근 시 → 본사 대시보드
        if ((role === 'admin' || role === 'staff') && isPartnerOnlyRoute(pathname)) {
          return NextResponse.redirect(createRedirect('/dashboard', request));
        }

        // 공인중개사 전용(/agent): realtor만 허용, partner/admin/staff → 리다이렉트
        if (isAgentOnlyRoute(pathname)) {
          if (role === 'partner') {
            return NextResponse.redirect(createRedirect('/partner/dashboard', request));
          }
          if (role === 'admin' || role === 'staff') {
            return NextResponse.redirect(createRedirect('/dashboard', request));
          }
        }

        // 제휴업체 전용(/affiliate): partner만 허용, realtor/admin/staff → 리다이렉트
        if (isAffiliateOnlyRoute(pathname)) {
          if (role === 'realtor') {
            return NextResponse.redirect(createRedirect('/agent/dashboard', request));
          }
          if (role === 'admin' || role === 'staff') {
            return NextResponse.redirect(createRedirect('/dashboard', request));
          }
        }
      } catch {
        // DB 조회 실패 시 클라이언트 가드에 위임
      }
    }

    return response;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[middleware] 런타임 에러:', err);
    }
    if (isProtectedRoute(pathname)) {
      return NextResponse.redirect(createRedirect('/login', request));
    }
    return response;
  }
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|_next/data|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
