/**
 * docs/ieum2_반영여부_체크리스트.md 전체 실제 구현 검증
 * - 로그인 관련 경로·env 사용
 * - 관리자/파트너 네비 메뉴별 페이지 파일 존재
 * - 미수금·제휴 DB구매·상태변경 API/페이지 연결
 */
import * as fs from 'fs';
import * as path from 'path';
import { AUTH_CALLBACK_PATH } from '@/lib/middleware-routes';
import { ADMIN_NAV_ITEMS, PARTNER_NAV_ITEMS } from '@/lib/admin-nav';

const APP_DIR = path.join(process.cwd(), 'app');

/** Next.js App Router: href → app 디렉터리 내 page.tsx 경로 */
function hrefToPagePath(href: string): string {
  const normalized = href.replace(/^\/+/, '').replace(/\/+$/, '') || 'page';
  if (normalized.startsWith('partner/')) {
    return path.join(APP_DIR, '(partner)', 'partner', normalized.slice(8), 'page.tsx');
  }
  return path.join(APP_DIR, normalized, 'page.tsx');
}

/** API 경로가 app/api 아래에 존재하는지 (route.ts) */
function apiRouteExists(apiPath: string): boolean {
  const p = path.join(process.cwd(), 'app', 'api', apiPath, 'route.ts');
  return fs.existsSync(p);
}

describe('ieum2 반영여부 체크리스트 — 실제 구현 검증', () => {
  describe('1) 로그인 관련 코드', () => {
    it('AUTH_CALLBACK_PATH가 /auth/callback 이다', () => {
      expect(AUTH_CALLBACK_PATH).toBe('/auth/callback');
    });

    it('auth/callback 라우트 파일이 존재한다', () => {
      const p = path.join(APP_DIR, 'auth', 'callback', 'route.ts');
      expect(fs.existsSync(p)).toBe(true);
    });

    it('middleware가 env 사용 (NEXT_PUBLIC_SUPABASE_*) — 미들웨어 파일 존재', () => {
      const p = path.join(process.cwd(), 'middleware.ts');
      expect(fs.existsSync(p)).toBe(true);
      const content = fs.readFileSync(p, 'utf-8');
      expect(content).toMatch(/NEXT_PUBLIC_SUPABASE_URL/);
      expect(content).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    });

    it('lib/auth.tsx에서 NEXT_PUBLIC_SITE_URL 및 auth/callback 사용', () => {
      const p = path.join(process.cwd(), 'lib', 'auth.tsx');
      expect(fs.existsSync(p)).toBe(true);
      const content = fs.readFileSync(p, 'utf-8');
      expect(content).toMatch(/NEXT_PUBLIC_SITE_URL|auth\/callback/);
    });
  });

  describe('2) 미수금 — 페이지·API·사이드바', () => {
    it('미수금 페이지 app/payments/receivables/page.tsx 존재', () => {
      expect(fs.existsSync(hrefToPagePath('/payments/receivables'))).toBe(true);
    });

    it('API: receivables, receivables-stats, create-payment-from-receivables 존재', () => {
      expect(apiRouteExists('admin/receivables')).toBe(true);
      expect(apiRouteExists('admin/receivables-stats')).toBe(true);
      expect(apiRouteExists('admin/create-payment-from-receivables')).toBe(true);
    });

    it('ADMIN_NAV_ITEMS에 미수금액 체크 및 결제 → /payments/receivables 포함', () => {
      const item = ADMIN_NAV_ITEMS.find((i) => i.name === '미수금액 체크 및 결제');
      expect(item).toBeDefined();
      expect(item!.href).toBe('/payments/receivables');
    });

    it('Sidebar가 ADMIN_NAV_ITEMS를 사용한다', () => {
      const sidebarPath = path.join(process.cwd(), 'components', 'Sidebar.tsx');
      expect(fs.existsSync(sidebarPath)).toBe(true);
      const content = fs.readFileSync(sidebarPath, 'utf-8');
      expect(content).toMatch(/ADMIN_NAV_ITEMS/);
    });
  });

  describe('3) 제휴업체 DB 구매 — 페이지·API·파트너 메뉴', () => {
    it('제휴 DB 구매 페이지 app/(partner)/partner/db-list/page.tsx 존재', () => {
      expect(fs.existsSync(hrefToPagePath('/partner/db-list'))).toBe(true);
    });

    it('API: partner/db-list, partner/db-view-pay 존재', () => {
      expect(apiRouteExists('partner/db-list')).toBe(true);
      expect(apiRouteExists('partner/db-view-pay')).toBe(true);
    });

    it('PARTNER_NAV_ITEMS에 DB 구매 → /partner/db-list 포함', () => {
      const item = PARTNER_NAV_ITEMS.find((i) => i.name === 'DB 구매');
      expect(item).toBeDefined();
      expect(item!.href).toBe('/partner/db-list');
    });

    it('(partner)/layout에서 PARTNER_NAV_ITEMS 사용', () => {
      const layoutPath = path.join(APP_DIR, '(partner)', 'layout.tsx');
      expect(fs.existsSync(layoutPath)).toBe(true);
      const content = fs.readFileSync(layoutPath, 'utf-8');
      expect(content).toMatch(/PARTNER_NAV_ITEMS/);
    });
  });

  describe('4) 제휴업체 DB 상태변경 UI — 페이지·API·메뉴', () => {
    it('assignments 페이지 app/(partner)/partner/assignments/page.tsx 존재', () => {
      expect(fs.existsSync(hrefToPagePath('/partner/assignments'))).toBe(true);
    });

    it('API: partner/assignment-update 존재', () => {
      expect(apiRouteExists('partner/assignment-update')).toBe(true);
    });

    it('PARTNER_NAV_ITEMS에 DB 관리 → /partner/assignments 포함', () => {
      const item = PARTNER_NAV_ITEMS.find((i) => i.name === 'DB 관리' && i.href === '/partner/assignments');
      expect(item).toBeDefined();
      expect(item!.href).toBe('/partner/assignments');
    });
  });

  describe('5) 관리자(본사) 메뉴 전부 페이지 존재', () => {
    const adminHrefs = ADMIN_NAV_ITEMS.map((i) => i.href).filter((h) => !h.includes('[id]'));
    it.each(adminHrefs)('%s 에 대응하는 page.tsx가 존재한다', (href) => {
      const pagePath = hrefToPagePath(href);
      expect(fs.existsSync(pagePath)).toBe(true);
    });
  });

  describe('6) 제휴업체(파트너) 메뉴 전부 페이지 존재', () => {
    const partnerHrefs = PARTNER_NAV_ITEMS.map((i) => i.href);
    it.each(partnerHrefs)('%s 에 대응하는 page.tsx가 존재한다', (href) => {
      const pagePath = hrefToPagePath(href);
      expect(fs.existsSync(pagePath)).toBe(true);
    });
  });
});
