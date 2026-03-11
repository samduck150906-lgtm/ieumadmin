/**
 * 미들웨어용 경로 판별 로직 — 단일 소스, 테스트 가능
 */

export const LOGIN_PATHS = ['/login', '/auth/login'];
export const AUTH_CALLBACK_PATH = '/auth/callback';

/** 비로그인 접근 허용(회원가입·협력업체 신청 페이지) */
export const PUBLIC_SIGNUP_PATHS = [
  '/members/partners/signup',
  '/members/realtors/signup',
  '/members/partners/signup/kakao-complete',
  '/members/realtors/signup/kakao-complete',
  '/partner/apply',
];

export function isPublicSignupPath(pathname: string): boolean {
  return PUBLIC_SIGNUP_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

export const PROTECTED_PREFIXES = [
  '/',
  '/admin',
  '/agent',
  '/affiliate',
  '/dashboard',
  '/requests',
  '/customers',
  '/lead-stats',
  '/members',
  '/settings',
  '/settlements',
  '/payments',
  '/notifications',
  '/notices',
  '/faqs',
  '/complaints',
  '/partner-applications',
  '/db-consultation',
  '/partner',
];

/** 관리자·스태프만 접근 가능 (파트너 차단) */
export const ADMIN_ONLY_PREFIXES = [
  '/dashboard',
  '/requests',
  '/customers',
  '/lead-stats',
  '/members',
  '/settings',
  '/settlements',
  '/payments',
  '/notifications',
  '/notices',
  '/faqs',
  '/complaints',
  '/partner-applications',
  '/db-consultation',
  '/admin',
];

/** 파트너만 접근 가능 (관리자·스태프 차단) */
export const PARTNER_ONLY_PREFIXES = ['/partner'];

/** 제휴업체(partner) 로그인 시 허용 경로 — 나머지 /partner/* 접근 시 대시보드로 리다이렉트 */
export const PARTNER_ALLOWED_PATHS = [
  '/partner',
  '/partner/dashboard',
  '/partner/db-list',
  '/partner/assignments',
  '/partner/unpaid-pay',
  '/partner/payments',
  '/partner/complaints',
  '/partner/change-password',
];

export function isPartnerAllowedPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/$/, '') || '/partner';
  return PARTNER_ALLOWED_PATHS.some(
    (p) => normalized === p || (p !== '/partner' && normalized.startsWith(p + '/'))
  );
}

/** 공인중개사(realtor)만 접근 가능 */
export const AGENT_ONLY_PREFIXES = ['/agent'];

/** 제휴업체(partner)만 접근 가능 */
export const AFFILIATE_ONLY_PREFIXES = ['/affiliate'];

export function isLoginPath(pathname: string): boolean {
  return LOGIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isAdminOnlyRoute(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isPartnerOnlyRoute(pathname: string): boolean {
  return PARTNER_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isAgentOnlyRoute(pathname: string): boolean {
  return AGENT_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function isAffiliateOnlyRoute(pathname: string): boolean {
  return AFFILIATE_ONLY_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}
