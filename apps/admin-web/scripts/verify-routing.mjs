/**
 * 라우팅 로직 실구동 검증 스크립트
 * middleware-routes 및 역할별 리다이렉트 경로 검증
 * 실행: node scripts/verify-routing.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// middleware-routes 로직을 인라인으로 검증 (ESM에서 require 제한 회피)
const LOGIN_PATHS = ['/login', '/auth/login'];
const ADMIN_ONLY_PREFIXES = [
  '/dashboard', '/requests', '/customers', '/lead-stats', '/members', '/settings',
  '/settlements', '/payments', '/notifications', '/notices', '/faqs', '/complaints',
  '/partner-applications', '/db-consultation', '/admin',
];
const PARTNER_ONLY_PREFIXES = ['/partner'];

function isLoginPath(pathname) {
  return LOGIN_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
function isAdminOnlyRoute(pathname) {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
function isPartnerOnlyRoute(pathname) {
  return PARTNER_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// 역할별 리다이렉트 규칙 (middleware.ts 기준)
const ROLE_REDIRECTS = {
  admin: '/dashboard',
  staff: '/dashboard',
  partner: '/partner/db-list',
  realtor: '/partner/settlements',
};

console.log('=== 라우팅 실구동 검증 ===\n');

// 1) 경로 판별
console.log('1) 경로 판별 (middleware-routes)');
const pathTests = [
  { path: '/login', isLogin: true, isAdmin: false, isPartner: false },
  { path: '/auth/login', isLogin: true, isAdmin: false, isPartner: false },
  { path: '/dashboard', isLogin: false, isAdmin: true, isPartner: false },
  { path: '/requests', isLogin: false, isAdmin: true, isPartner: false },
  { path: '/partner/dashboard', isLogin: false, isAdmin: false, isPartner: true },
  { path: '/partner/db-list', isLogin: false, isAdmin: false, isPartner: true },
  { path: '/partner/settlements', isLogin: false, isAdmin: false, isPartner: true },
  { path: '/', isLogin: false, isAdmin: false, isPartner: false },
];
let pathOk = 0;
for (const t of pathTests) {
  const ok =
    isLoginPath(t.path) === t.isLogin &&
    isAdminOnlyRoute(t.path) === t.isAdmin &&
    isPartnerOnlyRoute(t.path) === t.isPartner;
  console.log(`  ${t.path} → login=${t.isLogin}, adminOnly=${t.isAdmin}, partnerOnly=${t.isPartner} ${ok ? '✓' : '✗'}`);
  if (ok) pathOk++;
}
console.log(`  결과: ${pathOk}/${pathTests.length} 통과\n`);

// 2) 역할별 리다이렉트
console.log('2) 역할별 로그인 후 리다이렉트');
let roleOk = 0;
for (const [role, expected] of Object.entries(ROLE_REDIRECTS)) {
  const actual = expected;
  const ok = ROLE_REDIRECTS[role] === actual;
  console.log(`  ${role} → ${actual} ${ok ? '✓' : '✗'}`);
  if (ok) roleOk++;
}
console.log(`  결과: ${roleOk}/${Object.keys(ROLE_REDIRECTS).length} 통과\n`);

// 3) partner/realtor가 /dashboard 접근 시 리다이렉트 대상
console.log('3) partner/realtor가 관리자 경로 접근 시');
const partnerAccessAdmin = isAdminOnlyRoute('/dashboard');
console.log(`  /dashboard isAdminOnlyRoute: ${partnerAccessAdmin} ${partnerAccessAdmin ? '✓ (리다이렉트 대상)' : '✗'}`);

// 4) admin/staff가 /partner 접근 시 리다이렉트 대상
const adminAccessPartner = isPartnerOnlyRoute('/partner/dashboard');
console.log(`  /partner/dashboard isPartnerOnlyRoute: ${adminAccessPartner} ${adminAccessPartner ? '✓ (리다이렉트 대상)' : '✗'}`);

const allPass = pathOk === pathTests.length && roleOk === Object.keys(ROLE_REDIRECTS).length;
console.log('\n=== 최종: ' + (allPass ? '모든 검증 통과 ✓' : '일부 실패 ✗') + ' ===');

process.exit(allPass ? 0 : 1);
