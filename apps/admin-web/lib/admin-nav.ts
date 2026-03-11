import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Building2,
  FileText,
  Wallet,
  CreditCard,
  Bell,
  Settings,
  UserCheck,
  UserPlus,
  UserCog,
  DollarSign,
  Megaphone,
  HelpCircle,
  Share2,
  MessageSquare,
  Home,
  Send,
  BarChart3,
  FileCheck,
  ShoppingCart,
  Database,
  Banknote,
  AlertTriangle,
  Package,
  KeyRound,
  Star,
  Mail,
  TableProperties,
  MessageSquareWarning,
} from 'lucide-react';

/**
 * 역할별 표시 이름 (DB user_role과 통일: admin, staff, partner, realtor)
 * agent = realtor(공인중개사), affiliate = partner(제휴업체) — 경로/UI 별칭용.
 */
export const ROLE_TITLE: Record<'admin' | 'staff' | 'partner' | 'realtor', string> = {
  admin: '관리자',
  staff: '스태프',
  partner: '제휴업체',
  realtor: '공인중개사',
};

export type AppRole = keyof typeof ROLE_TITLE;

export function getRoleTitle(role: AppRole): string {
  return ROLE_TITLE[role] ?? role;
}

export interface NavSubItem {
  name: string;
  href: string;
  badge?: number;
}

export interface NavItem {
  name: string;
  href: string;
  icon: LucideIcon;
  /** true면 admin 역할만 표시 (staff는 숨김) */
  adminOnly?: boolean;
  /** 사이드바 섹션 구분 레이블 (설정 시 해당 항목 위에 그룹 헤더 표시) */
  groupLabel?: string;
  badge?: number;
  /** true면 pathname이 href와 정확히 일치할 때만 활성 스타일 적용 */
  exactMatch?: boolean;
  /** 하위 메뉴 (상담 관리: 신규/진행중/완료/취소, 파트너 관리: 목록/승인대기/정산 등) */
  subItems?: NavSubItem[];
}

/** 관리자(admin/staff) 사이드바 메뉴 — 명세 구조: 대시보드 / 상담 관리 / 파트너 관리 / 고객 / 정산 / 공지 / 설정 */
export const ADMIN_NAV_ITEMS: NavItem[] = [
  { name: '대시보드', href: '/dashboard', icon: LayoutDashboard },
  {
    name: '상담 관리',
    href: '/requests',
    icon: FileText,
    subItems: [
      { name: '신규', href: '/requests?status=unread' },
      { name: '진행중', href: '/requests?status=assigned' },
      { name: '완료', href: '/requests?status=settlement_done' },
      { name: '취소', href: '/requests?status=cancelled' },
    ],
  },
  {
    name: '파트너 관리',
    href: '/members/partners',
    icon: Building2,
    subItems: [
      { name: '제휴업체 목록', href: '/members/partners' },
      { name: '가입 신청 (홈페이지 유입)', href: '/partner-applications' },
      { name: '정산', href: '/settlements' },
    ],
  },
  { name: '고객 관리', href: '/customers', icon: BarChart3 },
  { name: '문의 관리', href: '/admin/inquiries', icon: MessageSquare },
  { name: '정산 관리', href: '/settlements', icon: Wallet },
  { name: '공지사항 관리', href: '/notices', icon: Megaphone },
  { name: '설정', href: '/settings', icon: Settings, exactMatch: true },

  // ── 추가 메뉴 (그룹) ─────────────────────────────────────
  { name: '서비스 요청 전체', href: '/requests', icon: FileText, groupLabel: '업무', exactMatch: true },
  { name: 'DB 분배', href: '/requests/distribution', icon: Share2 },
  { name: 'DB 구매 상담', href: '/db-consultation', icon: MessageSquare },
  { name: '폼메일 관리', href: '/formmail', icon: Mail },
  { name: '가망고객 DB 통계', href: '/lead-stats', icon: BarChart3, exactMatch: true },
  { name: '고객 민원 관리', href: '/complaints', icon: UserCheck },
  { name: '리뷰/평점 관리', href: '/reviews', icon: Star },
  { name: '공인중개사 관리', href: '/members/realtors', icon: Users, groupLabel: '회원' },
  { name: '제휴업체·공인중개사 가입 신청', href: '/partner-applications', icon: UserPlus },
  { name: '제휴업체 직접 등록', href: '/members/partners/signup', icon: UserPlus },
  { name: '공인중개사 직접 등록', href: '/members/realtors/signup', icon: UserPlus },
  { name: '직원 관리', href: '/members/staff', icon: UserCog, adminOnly: true },
  { name: '미수금액 체크 및 결제', href: '/payments/receivables', icon: DollarSign, groupLabel: '정산/결제' },
  { name: '결제 요청 목록', href: '/payments', icon: CreditCard, exactMatch: true },
  { name: '결제 내역', href: '/admin/payments', icon: CreditCard, exactMatch: true },
  { name: '무통장 개인 주문', href: '/payments/bank-transfer-orders', icon: FileText },
  { name: '수익금 정산내역', href: '/payments/settlement-history', icon: BarChart3 },
  { name: '추천 수수료 관리', href: '/admin/referral-commissions', icon: Star },
  { name: 'DB 가격·수익쉐어 설정', href: '/settings/db-prices', icon: DollarSign, groupLabel: '설정', adminOnly: true },
  { name: '폼메일 설정', href: '/settings/formmail', icon: Mail, groupLabel: '설정', adminOnly: true },
  { name: '수수료 전환표', href: '/settings/commission-conversion-table', icon: TableProperties },
  { name: 'DB마켓 구매정책', href: '/settings/db-market-policy', icon: Package, adminOnly: true },
  { name: '알림 내역', href: '/notifications', icon: Bell },
  { name: 'FAQ', href: '/faqs', icon: HelpCircle },
];

/**
 * 제휴업체(partner) 전용 사이드바 메뉴 — 로그인 시 5개 항목만 노출
 * 노출: 대시보드(일부) / DB 구매 / DB 관리 / 결제(미수) / 민원
 * 그 외(업체 정보·결제 내역·미수금·정산 등)는 각 화면 내 링크 또는 사이드바 하단으로 접근
 */
export const PARTNER_NAV_ITEMS: NavItem[] = [
  { name: '대시보드', href: '/partner/dashboard', icon: LayoutDashboard },
  { name: 'DB 구매', href: '/partner/db-list', icon: ShoppingCart },
  { name: 'DB 관리', href: '/partner/assignments', icon: Database },
  { name: '결제(미수)', href: '/partner/unpaid-pay', icon: DollarSign },
  { name: '민원', href: '/partner/complaints', icon: MessageSquareWarning },
];

/** 중개사(realtor) 전용 메뉴 — /partner 경로용, 내 매물·수익·제휴업체 매칭·개인정보 */
export const REALTOR_NAV_ITEMS: NavItem[] = [
  { name: '대시보드', href: '/partner/dashboard', icon: LayoutDashboard },
  { name: '내 매물 관리', href: '/partner/properties', icon: Home },
  { name: '내 수익 현황', href: '/partner/settlements', icon: BarChart3 },
  { name: '제휴업체 매칭 현황', href: '/partner/matching', icon: Share2 },
  { name: '고객 초대', href: '/partner/invite', icon: Send },
  { name: '추천인 관리', href: '/partner/invitations', icon: Users },
  { name: '개인정보 수정', href: '/partner/profile', icon: UserCog },
];

/** /agent 경로용 공인중개사(agent=realtor) 메뉴 — 전체 통계/내 매물/제휴업체 매칭/개인정보 */
export const AGENT_NAV_ITEMS: NavItem[] = [
  { name: '내 매물 관리', href: '/agent/dashboard', icon: LayoutDashboard },
  { name: '제휴업체 매칭 현황', href: '/partner/matching', icon: Share2 },
  { name: '개인정보 수정', href: '/partner/profile', icon: UserCog },
  { name: '내 수익 현황', href: '/partner/settlements', icon: BarChart3 },
  { name: '고객 초대', href: '/partner/invite', icon: Send },
  { name: '추천인 관리', href: '/partner/invitations', icon: Users },
];

/** /affiliate 경로용 제휴업체(affiliate=partner) 메뉴 — 내 견적/공인중개사 요청/업체 정보 */
export const AFFILIATE_NAV_ITEMS: NavItem[] = [
  { name: '내 견적 관리', href: '/affiliate/dashboard', icon: LayoutDashboard },
  { name: '공인중개사 요청 목록', href: '/partner/assignments', icon: Database },
  { name: '업체 정보 관리', href: '/partner/profile', icon: UserCog },
  { name: 'DB 구매', href: '/partner/db-list', icon: ShoppingCart },
  { name: 'DB 관리', href: '/partner/assignments', icon: Database },
  { name: '미수금 관리', href: '/partner/receivables', icon: AlertTriangle },
  { name: '결제(미수 등)', href: '/partner/unpaid-pay', icon: DollarSign },
  { name: '결제 내역', href: '/partner/payments', icon: CreditCard },
  { name: '고객 민원 관리', href: '/partner/complaints', icon: MessageSquareWarning },
];

/** 모바일 하단 바로가기용 4개 — href로 참조해 인덱스 변경에 안전 */
export const MOBILE_QUICK_NAV: NavItem[] = [
  ADMIN_NAV_ITEMS.find((i) => i.href === '/dashboard')!,
  ADMIN_NAV_ITEMS.find((i) => i.href === '/requests')!,
  ADMIN_NAV_ITEMS.find((i) => i.href === '/complaints')!,
  ADMIN_NAV_ITEMS.find((i) => i.href === '/settlements')!,
];

/** 명세용 어드민 메뉴 (/admin/*) */
export const ADMIN_SPEC_NAV_ITEMS: NavItem[] = [
  { name: '대시보드', href: '/admin', icon: LayoutDashboard, exactMatch: true },
  { name: '회원 관리', href: '/admin/users', icon: Users },
  { name: '파트너 관리', href: '/admin/partners', icon: Building2 },
  { name: '문의 관리', href: '/admin/inquiries', icon: MessageSquare },
  { name: '고객 민원 관리', href: '/complaints', icon: AlertTriangle },
  { name: '정산 관리', href: '/admin/settlements', icon: Wallet },
  { name: '미수금액 체크 및 결제', href: '/payments/receivables', icon: DollarSign },
  { name: '매물 관리', href: '/admin/properties', icon: Home },
  { name: '수수료 관리', href: '/admin/commissions', icon: DollarSign },
  { name: '추천 수수료', href: '/admin/referral-commissions', icon: Star },
  { name: '결제 내역', href: '/admin/payments', icon: CreditCard, exactMatch: true },
  { name: '공인중개사 관리', href: '/members/realtors', icon: Users },
  { name: '제휴업체·공인중개사 가입 신청', href: '/partner-applications', icon: UserPlus },
  { name: 'DB 가격·수익쉐어 설정', href: '/settings/db-prices', icon: DollarSign, adminOnly: true },
  { name: '초대 관리', href: '/admin/invitations', icon: Send },
  { name: '알림 관리', href: '/admin/notifications', icon: Bell },
  { name: '리포트', href: '/admin/reports', icon: BarChart3 },
  { name: '설정', href: '/admin/settings', icon: Settings },
  { name: '감사 로그', href: '/admin/audit-log', icon: FileCheck },
];
