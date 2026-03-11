/**
 * 앱 공통 상수
 */

export const APP_NAME = '이음';
export const APP_NAME_EN = 'IEUM';

export const PAGINATION_LIMITS = [20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export const PARTNER_TIERS = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
] as const;

export const SETTLEMENT_STATUSES = [
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
] as const;

export const DATE_FORMAT_DOT = 'yyyy.MM.dd';
export const DATE_FORMAT_DASH = 'yyyy-MM-dd';
export const DATETIME_FORMAT = 'yyyy.MM.dd HH:mm';
