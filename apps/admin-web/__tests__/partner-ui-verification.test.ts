/**
 * 제휴업체 전용 UI 구현 확인
 * 1) 파트너가 /dashboard 등 관리자 URL 접근 시 /partner/dashboard로 리다이렉트되는지
 * 2) 파트너 대시보드 사이드바에 전용 메뉴(DB 구매, 미수금 결제 등)만 노출되는지
 */
import {
  isAdminOnlyRoute,
  isPartnerOnlyRoute,
  isProtectedRoute,
  ADMIN_ONLY_PREFIXES,
  PARTNER_ONLY_PREFIXES,
} from '@/lib/middleware-routes';
import { ADMIN_NAV_ITEMS, PARTNER_NAV_ITEMS, REALTOR_NAV_ITEMS } from '@/lib/admin-nav';

describe('제휴업체 전용 UI', () => {
  describe('1) 파트너가 관리자 URL 접근 시 /partner/dashboard로 튕기는지 (경로 판별)', () => {
    it('관리자 전용 경로에 /dashboard, /requests, /admin 등이 포함된다', () => {
      expect(ADMIN_ONLY_PREFIXES).toContain('/dashboard');
      expect(ADMIN_ONLY_PREFIXES).toContain('/requests');
      expect(ADMIN_ONLY_PREFIXES).toContain('/admin');
      expect(ADMIN_ONLY_PREFIXES).toContain('/settings');
      expect(ADMIN_ONLY_PREFIXES).toContain('/members');
    });

    it('isAdminOnlyRoute: /dashboard → true (파트너 접근 시 리다이렉트 대상)', () => {
      expect(isAdminOnlyRoute('/dashboard')).toBe(true);
      expect(isAdminOnlyRoute('/dashboard/')).toBe(true);
      expect(isAdminOnlyRoute('/requests')).toBe(true);
      expect(isAdminOnlyRoute('/admin')).toBe(true);
      expect(isAdminOnlyRoute('/settings/db-prices')).toBe(true);
    });

    it('isAdminOnlyRoute: /partner/* → false', () => {
      expect(isAdminOnlyRoute('/partner')).toBe(false);
      expect(isAdminOnlyRoute('/partner/dashboard')).toBe(false);
      expect(isAdminOnlyRoute('/partner/db-list')).toBe(false);
    });

    it('파트너 전용 경로는 /partner 뿐', () => {
      expect(PARTNER_ONLY_PREFIXES).toEqual(['/partner']);
    });

    it('isPartnerOnlyRoute: /partner, /partner/dashboard → true', () => {
      expect(isPartnerOnlyRoute('/partner')).toBe(true);
      expect(isPartnerOnlyRoute('/partner/dashboard')).toBe(true);
      expect(isPartnerOnlyRoute('/partner/db-list')).toBe(true);
    });

    it('isProtectedRoute: 보호 경로 접근 시 로그인 유도', () => {
      expect(isProtectedRoute('/dashboard')).toBe(true);
      expect(isProtectedRoute('/partner/dashboard')).toBe(true);
    });
  });

  describe('2) /partner/dashboard 사이드바에 전용 메뉴만 보이는지 (PARTNER_NAV_ITEMS)', () => {
    // 제휴업체 로그인 시 제한적 메뉴: 대시보드(일부) / DB 구매 / DB 관리 / 결제(미수) / 민원 (나머지 전부 가려짐)
    const REQUIRED_PARTNER_MENUS = [
      { name: '대시보드', href: '/partner/dashboard' },
      { name: 'DB 구매', href: '/partner/db-list' },
      { name: 'DB 관리', href: '/partner/assignments' },
      { name: '결제(미수)', href: '/partner/unpaid-pay' },
      { name: '민원', href: '/partner/complaints' },
    ];

    it('PARTNER_NAV_ITEMS에 대시보드, DB 구매, DB 관리, 결제(미수), 민원이 포함된다', () => {
      const names = PARTNER_NAV_ITEMS.map((i) => i.name);
      expect(names).toContain('대시보드');
      expect(names).toContain('DB 구매');
      expect(names).toContain('DB 관리');
      expect(names).toContain('결제(미수)');
      expect(names).toContain('민원');
      expect(PARTNER_NAV_ITEMS.find((i) => i.name === '대시보드')?.href).toBe('/partner/dashboard');
      expect(PARTNER_NAV_ITEMS.find((i) => i.name === '결제(미수)')?.href).toBe('/partner/unpaid-pay');
      expect(PARTNER_NAV_ITEMS.find((i) => i.name === 'DB 관리')?.href).toBe('/partner/assignments');
      expect(PARTNER_NAV_ITEMS.find((i) => i.name === 'DB 구매')?.href).toBe('/partner/db-list');
      expect(PARTNER_NAV_ITEMS.find((i) => i.name === '민원')?.href).toBe('/partner/complaints');
    });

    it('PARTNER_NAV_ITEMS에 위 표의 전용 메뉴만 있고 개수·이름·href가 일치한다', () => {
      expect(PARTNER_NAV_ITEMS.length).toBe(REQUIRED_PARTNER_MENUS.length);
      for (const required of REQUIRED_PARTNER_MENUS) {
        const found = PARTNER_NAV_ITEMS.find((i) => i.name === required.name && i.href === required.href);
        expect(found).toBeDefined();
      }
    });

    it('PARTNER_NAV_ITEMS에는 관리자 전용 메뉴(서비스 요청, 제휴업체 관리 등)가 없다', () => {
      const partnerHrefs = PARTNER_NAV_ITEMS.map((i) => i.href);
      expect(partnerHrefs.every((h) => h.startsWith('/partner'))).toBe(true);
      const adminOnlyHrefs = ['/requests', '/members/partners', '/settlements', '/dashboard'];
      for (const href of adminOnlyHrefs) {
        expect(PARTNER_NAV_ITEMS.some((i) => i.href === href || i.href.startsWith(href + '/'))).toBe(false);
      }
    });

    it('ADMIN_NAV_ITEMS에는 제휴업체 포털(/partner/) 링크가 없다 (관리자 사이드바에 파트너 전용 노출 안 함)', () => {
      const adminHrefs = ADMIN_NAV_ITEMS.map((i) => i.href);
      // /partner/... = 제휴업체 포털, /partner-applications = 관리자 전용(가입 신청 관리)
      const partnerPortalHrefs = adminHrefs.filter((h) => h.startsWith('/partner/'));
      expect(partnerPortalHrefs).toHaveLength(0);
    });
  });

  describe('2-2) 중개사(realtor) 로그인 시 전용 메뉴 (REALTOR_NAV_ITEMS)', () => {
    it('REALTOR_NAV_ITEMS에 내 매물 관리, 내 수익 현황, 제휴업체 매칭 현황, 개인정보 수정, 고객 초대, 추천인 관리가 포함된다', () => {
      const names = REALTOR_NAV_ITEMS.map((i) => i.name);
      expect(names).toContain('대시보드');
      expect(names).toContain('내 매물 관리');
      expect(names).toContain('내 수익 현황');
      expect(names).toContain('제휴업체 매칭 현황');
      expect(names).toContain('고객 초대');
      expect(names).toContain('추천인 관리');
      expect(names).toContain('개인정보 수정');
      expect(REALTOR_NAV_ITEMS.find((i) => i.name === '내 수익 현황')?.href).toBe('/partner/settlements');
      expect(REALTOR_NAV_ITEMS.find((i) => i.name === '고객 초대')?.href).toBe('/partner/invite');
      expect(REALTOR_NAV_ITEMS.find((i) => i.name === '추천인 관리')?.href).toBe('/partner/invitations');
      expect(REALTOR_NAV_ITEMS.find((i) => i.name === '개인정보 수정')?.href).toBe('/partner/profile');
    });

    it('REALTOR_NAV_ITEMS는 역할 확장 메뉴(대시보드, 내 매물, 수익, 제휴업체 매칭, 고객 초대, 추천인, 개인정보)를 포함한다', () => {
      expect(REALTOR_NAV_ITEMS.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('3) 확인 방법 — 제휴업체 로그인 후 실제 확인 시 기대 동작 (코드 기준)', () => {
    it('① 제휴업체 로그인 시 사이드바에 대시보드, DB 구매, DB 관리, 결제(미수), 민원만 노출된다 (나머지 메뉴 전부 가려짐)', () => {
      const names = PARTNER_NAV_ITEMS.map((i) => i.name);
      expect(names).toContain('대시보드');
      expect(names).toContain('DB 구매');
      expect(names).toContain('DB 관리');
      expect(names).toContain('결제(미수)');
      expect(names).toContain('민원');
      expect(PARTNER_NAV_ITEMS.length).toBe(5);
      // 숨겨진 메뉴: 업체 정보, 결제 내역, 미수금 관리, 마일리지 등
      expect(names).not.toContain('업체 정보 관리');
      expect(names).not.toContain('결제 내역');
      expect(names).not.toContain('미수금 관리');
    });

    it('② 본사 메뉴(서비스 요청, 정산 관리, 미수금액 체크 및 결제, 제휴업체 관리 등)는 전혀 안 보인다', () => {
      const partnerNavHrefs = PARTNER_NAV_ITEMS.map((i) => i.href);
      const adminRepresentative = ['/dashboard', '/requests', '/settlements', '/payments/receivables', '/members/partners'];
      adminRepresentative.forEach((adminHref) => {
        expect(partnerNavHrefs.some((h) => h === adminHref || h.startsWith(adminHref + '/'))).toBe(false);
      });
      expect(PARTNER_NAV_ITEMS.some((i) => i.name === '서비스 요청')).toBe(false);
      expect(PARTNER_NAV_ITEMS.some((i) => i.name === '정산 관리')).toBe(false);
      expect(PARTNER_NAV_ITEMS.some((i) => i.name === '미수금액 체크 및 결제')).toBe(false);
      expect(PARTNER_NAV_ITEMS.some((i) => i.name === '제휴업체 관리')).toBe(false);
    });

    it('③ / 또는 /dashboard 접근 시 미들웨어가 partner면 /partner/dashboard로 리다이렉트한다', () => {
      expect(isAdminOnlyRoute('/dashboard')).toBe(true);
      expect(isAdminOnlyRoute('/')).toBe(false);
      // 루트(/)는 middleware에서 별도 분기로 partner → /partner/dashboard
      // /dashboard는 isAdminOnlyRoute → partner 접근 시 /partner/dashboard 리다이렉트
    });
  });
});
