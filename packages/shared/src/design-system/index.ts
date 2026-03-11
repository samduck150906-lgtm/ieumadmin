/**
 * 이음(IEUM) 디자인 시스템 — 공통 토큰 (JS/TS)
 * CSS 변수·Tailwind preset과 동기화: css-variables.css, tailwind.preset.js
 * 브랜드: 연결·신뢰 — Primary 블루, Accent 웜, Gold(B2B)
 */

// ============ Spacing (4px grid) ============
export const spacing = {
  4: 4,
  8: 8,
  12: 12,
  16: 16,
  24: 24,
  32: 32,
  48: 48,
  64: 64,
  96: 96,
} as const;

export type SpacingKey = keyof typeof spacing;

// ============ Typography scale (px) ============
export const typography = {
  '14': { fontSize: 14, lineHeight: 1.5, fontWeight: 400 as const },
  '16': { fontSize: 16, lineHeight: 1.6, fontWeight: 400 as const },
  '20': { fontSize: 20, lineHeight: 1.4, fontWeight: 400 as const },
  '24': { fontSize: 24, lineHeight: 1.3, fontWeight: 600 as const },
  '32': { fontSize: 32, lineHeight: 1.25, fontWeight: 700 as const },
  '40': { fontSize: 40, lineHeight: 1.2, fontWeight: 700 as const },
  '56': { fontSize: 56, lineHeight: 1.15, fontWeight: 700 as const },
  'title-xl': { fontSize: 24, lineHeight: 1.3, fontWeight: '600' as const },
  'title-lg': { fontSize: 20, lineHeight: 1.35, fontWeight: '600' as const },
  'body-md': { fontSize: 16, lineHeight: 1.6, fontWeight: '400' as const },
  'caption-sm': { fontSize: 14, lineHeight: 1.45, fontWeight: '500' as const },
} as const;

export type TypographyKey = keyof typeof typography;

// ============ Color Tokens (아정당 블루·그린 통일) ============
export const colors = {
  primary: {
    900: '#163D94',
    700: '#1957C2',
    600: '#1B64DA',
    500: '#3182F6',
    300: '#66B2FF',
    100: '#CCE5FF',
    50: '#E8F3FF',
    DEFAULT: '#3182F6',
  },
  secondary: {
    900: '#0F2D6E',
    700: '#1B4DB8',
    500: '#3B82F6',
    300: '#93C5FD',
    100: '#DBEAFE',
    50: '#EFF6FF',
    DEFAULT: '#3B82F6',
  },
  accent: { 600: '#2563EB', 500: '#3B82F6', DEFAULT: '#3B82F6' },
  gold: { 500: '#2563EB', 300: '#93C5FD' },
  neutral: {
    900: '#191F28',
    700: '#4E5968',
    400: '#8B95A1',
    200: '#E5E8EB',
    50: '#F9FAFB',
  },
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3182F6',
  'bg-page': '#F9FAFB',
  'bg-card': '#FFFFFF',
  'bg-dark': '#191F28',
} as const;

export type ColorKey = keyof typeof colors;

// ============ Radius ============
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 9999,
} as const;

// ============ Motion ============
export const motion = {
  duration: { fast: 150, normal: 300, slow: 500 },
  easing: 'cubic-bezier(0.4, 0, 0.2, 1)' as const,
  easingArray: [0.4, 0, 0.2, 1] as [number, number, number, number],
  spring: {
    snappy: { stiffness: 400, damping: 28 },
    gentle: { stiffness: 300, damping: 25 },
    bouncy: { stiffness: 500, damping: 22 },
    slow: { stiffness: 200, damping: 30 },
  },
} as const;

// ============ Elevation ============
export const elevation = {
  sm: '0 1px 2px rgba(0,0,0,0.05)',
  md: '0 4px 12px rgba(0,0,0,0.08)',
  lg: '0 8px 24px rgba(0,0,0,0.12)',
  flat: '0 1px 2px rgba(0,0,0,0.04)',
  card: '0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)',
  cardHover: '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)',
  dropdown: '0 4px 6px -1px rgba(0,0,0,0.08), 0 2px 4px -1px rgba(0,0,0,0.04)',
  modal: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
} as const;
