/**
 * 이음(IEUM) Tailwind preset — 고객/중개사 랜딩·관리자 대시보드 공통
 * 사용: presets: [require('@ieum/shared/tailwind.preset.js')]
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        /* Primary (아정당 블루) */
        primary: {
          900: '#163D94',
          700: '#1957C2',
          600: '#1B64DA',
          500: '#3182F6',
          400: '#3182F6',
          300: '#66B2FF',
          200: '#99CCFF',
          100: '#CCE5FF',
          50: '#E8F3FF',
          DEFAULT: '#3182F6',
        },
        /* Secondary (파란색 계열 — primary와 통일) */
        secondary: {
          900: '#0F2D6E',
          700: '#1B4DB8',
          600: '#2563EB',
          500: '#3B82F6',
          400: '#60A5FA',
          300: '#93C5FD',
          200: '#BFDBFE',
          100: '#DBEAFE',
          50: '#EFF6FF',
          DEFAULT: '#3B82F6',
        },
        /* Accent (파란색 CTA) */
        accent: {
          600: '#2563EB',
          500: '#3B82F6',
          DEFAULT: '#3B82F6',
        },
        /* Gold B2B (파란색 톤) */
        gold: {
          500: '#2563EB',
          300: '#93C5FD',
        },
        /* Neutral */
        neutral: {
          900: '#191F28',
          700: '#4E5968',
          400: '#8B95A1',
          200: '#E5E8EB',
          50: '#F9FAFB',
        },
        /* Status */
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        /* Background semantic */
        'bg-page': '#F9FAFB',
        'bg-card': '#FFFFFF',
        'bg-dark': '#0D1B2A',
      },
      fontFamily: {
        display: ['SUIT Variable', 'Pretendard', 'system-ui', 'sans-serif'],
        sans: ['Pretendard Variable', 'Pretendard', 'Apple SD Gothic Neo', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      fontSize: {
        '14': ['14px', { lineHeight: '1.5' }],
        '16': ['16px', { lineHeight: '1.6' }],
        '20': ['20px', { lineHeight: '1.4' }],
        '24': ['24px', { lineHeight: '1.3' }],
        '32': ['32px', { lineHeight: '1.25' }],
        '40': ['40px', { lineHeight: '1.2' }],
        '56': ['56px', { lineHeight: '1.15' }],
        /* Semantic aliases */
        display: ['56px', { lineHeight: '1.15', fontWeight: '700' }],
        'display-sm': ['40px', { lineHeight: '1.2', fontWeight: '700' }],
        h1: ['32px', { lineHeight: '1.25', fontWeight: '700' }],
        h2: ['24px', { lineHeight: '1.3', fontWeight: '600' }],
        h3: ['20px', { lineHeight: '1.35', fontWeight: '600' }],
        'body-lg': ['20px', { lineHeight: '1.6', fontWeight: '400' }],
        body: ['16px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-sm': ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['14px', { lineHeight: '1.45', fontWeight: '500' }],
      },
      spacing: {
        '4': '4px',
        '8': '8px',
        '12': '12px',
        '16': '16px',
        '24': '24px',
        '32': '32px',
        '48': '48px',
        '64': '64px',
        '96': '96px',
      },
      borderRadius: {
        sm: '4px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0,0,0,0.05)',
        md: '0 4px 12px rgba(0,0,0,0.08)',
        lg: '0 8px 24px rgba(0,0,0,0.12)',
      },
      transitionDuration: {
        fast: '150ms',
        normal: '300ms',
        slow: '500ms',
      },
      transitionTimingFunction: {
        ieum: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn var(--duration-normal, 300ms) cubic-bezier(0.4, 0, 0.2, 1)',
        'slide-up': 'slideUp var(--duration-normal, 300ms) cubic-bezier(0.4, 0, 0.2, 1)',
        'scale-in': 'scaleIn var(--duration-fast, 150ms) cubic-bezier(0.4, 0, 0.2, 1)',
      },
    },
  },
};
