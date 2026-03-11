/**
 * 미들웨어용 경로 판별 로직 — 단일 소스, 테스트 가능
 * 화이트리스트 방식: 공개 경로만 명시, 나머지는 모두 보호(인증 필요)
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

export function isLoginPath(pathname: string): boolean {
  return LOGIN_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** 인증 없이 접근 가능한 경로 (화이트리스트). 이 외 모든 경로는 보호됨. */
function isPublicPath(pathname: string): boolean {
  if (isLoginPath(pathname)) return true;
  if (pathname === AUTH_CALLBACK_PATH || pathname.startsWith(`${AUTH_CALLBACK_PATH}/`)) return true;
  if (isPublicSignupPath(pathname)) return true;
  return false;
}

/** 인증 필요 여부. 공개 경로가 아니면 모두 보호(로그인 유도). */
export function isProtectedRoute(pathname: string): boolean {
  return !isPublicPath(pathname);
}

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
  '/partner/receivables',
  '/partner/profile',
  '/partner/matching',
  '/partner/invite',
  '/partner/invitations',
  '/partner/settlements',
  '/partner/properties',
  '/partner/mileage',
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
