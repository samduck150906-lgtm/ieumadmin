/**
 * 브랜드/연락처 상수 (랜딩·앱·어드민 공통)
 */

export const CONTACT_PHONE = '1833-9413';
export const CONTACT_EMAIL = 'desk@ieum.in';
export const COMPANY_NAME = '주식회사 이음';
export const BRAND_NAME = '이음';
export const DEFAULT_DOMAIN = 'ieum.in';
export const DEFAULT_SITE_URL = `https://${DEFAULT_DOMAIN}`;

/**
 * 폼 신청용 서비스 옵션 (추가/삭제 시 이 배열만 수정)
 * - id: DB service_category enum 값과 일치해야 함
 * - label: UI 표시명
 * - emoji: 카드 아이콘
 */
export const SERVICE_OPTIONS = [
  { id: 'moving', label: '이사', emoji: '🚛' },
  { id: 'internet_tv', label: '인터넷·TV', emoji: '📡' },
  { id: 'cleaning', label: '입주청소', emoji: '🧹' },
  { id: 'interior', label: '인테리어', emoji: '🏠' },
  { id: 'appliance_rental', label: '가전렌탈', emoji: '🔌' },
  { id: 'water_purifier_rental', label: '정수기렌탈', emoji: '💧' },
  { id: 'kiosk', label: '키오스크', emoji: '🖥️' },
] as const;

/** 서비스 ID 배열 (API 유효성 검사 등에 사용) */
export const VALID_SERVICE_IDS = SERVICE_OPTIONS.map((s) => s.id);

/** 서비스 ID → 라벨 매핑 (알림톡·이메일 등에 사용) */
export const SERVICE_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  SERVICE_OPTIONS.map((s) => [s.id, s.label])
);
