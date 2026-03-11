/**
 * 필수 환경 변수 검증 (admin-web)
 * NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SITE_URL 등 누락 시 명확한 에러 메시지 제공
 */

declare global {
  interface Window {
    __NEXT_PUBLIC_ENV__?: Record<string, string>;
  }
}

const getEnv = (key: string): string => {
  if (typeof window !== 'undefined') {
    if (window.__NEXT_PUBLIC_ENV__?.[key]) return (window.__NEXT_PUBLIC_ENV__[key] || '').trim();
    try {
      const raw = document.documentElement.getAttribute('data-env');
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed[key]) return (parsed[key] || '').trim();
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[env] data-env JSON 파싱 실패:', e);
      }
    }
  }
  const v = typeof process !== 'undefined' ? process.env?.[key] : undefined;
  return (typeof v === 'string' ? v.trim() : '') || '';
};

export type EnvCheckResult =
  | { ok: true }
  | { ok: false; missing: string[]; message: string };

/** 필수 환경 변수 목록 */
const REQUIRED_ENV_KEYS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SITE_URL',
] as const;

const PLACEHOLDER_PATTERNS: Record<string, string[]> = {
  NEXT_PUBLIC_SUPABASE_URL: ['your-project.supabase.co'],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ['your-anon-key'],
  NEXT_PUBLIC_SITE_URL: ['your-admin-domain.com'],
};

function isPlaceholder(key: string, value: string): boolean {
  const patterns = PLACEHOLDER_PATTERNS[key];
  if (!patterns) return false;
  const v = value.toLowerCase();
  return patterns.some((p) => v.includes(p));
}

/** NEXT_PUBLIC_SITE_URL가 유효한 URL 형식인지 확인 */
function isValidSiteUrl(value: string): boolean {
  return /^https?:\/\/[^\s]+$/.test(value);
}

/**
 * 필수 환경 변수 검증
 * @returns ok: true이면 정상, ok: false이면 누락된 변수와 안내 메시지 반환
 */
export function checkRequiredEnv(): EnvCheckResult {
  const missing: string[] = [];

  for (const key of REQUIRED_ENV_KEYS) {
    const value = getEnv(key);
    if (!value || isPlaceholder(key, value)) missing.push(key);
    else if (key === 'NEXT_PUBLIC_SITE_URL' && !isValidSiteUrl(value)) missing.push(key);
  }

  if (missing.length === 0) return { ok: true };

  const envHint =
    process.env.NETLIFY || process.env.VERCEL
      ? '배포 대시보드(Netlify/Vercel) > Environment Variables에서 설정 후 재배포하세요.'
      : 'admin-web/.env 또는 .env.local에 설정하고 개발 서버를 재시작하세요.';

  const message =
    missing.length === 1
      ? `${missing[0]}가 설정되지 않았거나 예시 값입니다. ${envHint}`
      : `다음 환경 변수가 설정되지 않았습니다: ${missing.join(', ')}. ${envHint}`;

  return { ok: false, missing, message };
}

/** NEXT_PUBLIC_SITE_URL만 검증 (OAuth/QR 등에 필수) */
export function isSiteUrlConfigured(): boolean {
  const url = getEnv('NEXT_PUBLIC_SITE_URL');
  return Boolean(url && !isPlaceholder('NEXT_PUBLIC_SITE_URL', url));
}
