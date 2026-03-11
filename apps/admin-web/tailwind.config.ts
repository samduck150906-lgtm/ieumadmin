import type { Config } from 'tailwindcss';
import daisyui from 'daisyui';
import ieumPreset from '@ieum/shared/tailwind.preset.js';

/** 이음 통합 디자인 시스템 preset + 어드민 전용 확장 */

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx,css}',
  ],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  presets: [ieumPreset as any],
  theme: {
    extend: {
      colors: {
        /** preset과 동일 유지 (daisyUI 병합 후에도 @apply에서 사용) */
        neutral: {
          900: '#191F28',
          700: '#4E5968',
          400: '#8B95A1',
          200: '#E5E8EB',
          50: '#F9FAFB',
        },
        /** brand = primary 동의어 (토스/아정당 스타일 블루) */
        brand: {
          50: '#E8F3FF',
          100: '#CCE5FF',
          200: '#99CCFF',
          300: '#66B2FF',
          400: '#3182F6',
          500: '#3182F6',
          600: '#1B64DA',
          700: '#1957C2',
          800: '#194AAB',
          900: '#163D94',
          primary: '#3182F6',
          error: '#EF4444',
        },
        secondary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#3B82F6',
          600: '#2563EB',
          700: '#1B4DB8',
          800: '#1B4DB8',
          900: '#0F2D6E',
        },
        /** 어드민 전용: 사이드바·다크 영역 (토스 다크 블루) */
        sidebar: {
          DEFAULT: '#191F28',
          hover: '#333D4B',
          active: '#3182F6',
          text: '#F2F4F6',
          textMuted: '#8B95A1',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          muted: '#F9FAFB',
        },
        text: {
          DEFAULT: '#191F28',
          secondary: '#4E5968',
          muted: '#8B95A1',
        },
        /** primary = brand 동의어 (preset override) */
        primary: {
          50: '#E8F3FF',
          100: '#CCE5FF',
          200: '#99CCFF',
          300: '#66B2FF',
          400: '#3182F6',
          500: '#3182F6',
          600: '#1B64DA',
          700: '#1957C2',
          800: '#194AAB',
          900: '#163D94',
          DEFAULT: '#3182F6',
        },
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)',
        'card-hover': '0 8px 24px rgba(0,0,0,0.06), 0 2px 8px rgba(0,0,0,0.04)',
        'card-glow': '0 0 0 2px rgba(49,130,246,0.12), 0 4px 16px rgba(0,0,0,0.06)',
        button: '0 2px 8px rgba(49,130,246,0.25)',
        'button-sm': '0 2px 4px rgba(49,130,246,0.2)',
        dropdown: '0 4px 20px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)',
        modal: '0 24px 48px -12px rgba(0,0,0,0.12), 0 8px 24px rgba(0,0,0,0.06)',
      },
      backgroundImage: {
        'gradient-page': 'linear-gradient(180deg, #F9FAFB 0%, #FFFFFF 100%)',
        'gradient-card-primary': 'linear-gradient(135deg, #E8F3FF 0%, #F2F7FF 100%)',
        'gradient-brand': 'linear-gradient(135deg, #3182F6 0%, #66B2FF 100%)',
        'gradient-hero': 'linear-gradient(180deg, #F2F7FF 0%, #F9FAFB 50%, #FFFFFF 100%)',
      },
      borderRadius: {
        'card-lg': '16px',
        'card-xl': '20px',
        'button-lg': '14px',
      },
      keyframes: {
        slideInLeft: {
          '0%': { opacity: '0', transform: 'translateX(-16px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        overlayIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
      },
      animation: {
        'slide-in-left': 'slideInLeft 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        'overlay-in': 'overlayIn 0.2s ease-out',
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    exclude: ['properties'],
    themes: [
      'light',
      {
        dashboard: {
          primary: '#3182F6',
          'primary-content': '#ffffff',
          secondary: '#10B981',
          'base-100': '#ffffff',
          'base-200': '#F9FAFB',
          'base-300': '#F2F4F6',
          'base-content': '#191F28',
        },
      },
    ],
  },
};

export default config;
