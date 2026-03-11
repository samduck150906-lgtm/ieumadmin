import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase 환경 변수 참조 (Netlify 배포 시)
 * - NEXT_PUBLIC_*: 빌드 시점에 번들에 인라인됨. Netlify 대시보드 > Site settings > Environment variables에 설정.
 * - 클라이언트: layout에서 주입한 window.__NEXT_PUBLIC_ENV__ 우선 (webpack env 누락 시)
 */
function getSupabaseEnv(key: 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY'): string {
  if (typeof window !== 'undefined') {
    // data-env (layout) → window.__NEXT_PUBLIC_ENV__ (스크립트) 우선
    const w = window as { __NEXT_PUBLIC_ENV__?: Record<string, string> };
    if (w.__NEXT_PUBLIC_ENV__?.[key]) return (w.__NEXT_PUBLIC_ENV__[key] || '').trim();
    // data-env 직접 파싱 (스크립트 실행 전 모듈 로드 시)
    try {
      const raw = document.documentElement.getAttribute('data-env');
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, string>;
        if (parsed[key]) return (parsed[key] || '').trim();
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') {
        console.debug('[supabase] data-env JSON 파싱 실패:', e);
      }
    }
  }
  return (process.env[key]?.trim() || '');
}

// 지연 초기화: window.__NEXT_PUBLIC_ENV__가 layout 스크립트 실행 후 설정되므로, 첫 접근 시점에 클라이언트 생성
let _supabaseClient: SupabaseClient | null = null;
export function getBrowserClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (_supabaseClient) return _supabaseClient;
  const url = getSupabaseEnv('NEXT_PUBLIC_SUPABASE_URL');
  const key = getSupabaseEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  if (!url || !key) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ [admin-web] Supabase 필수 환경변수 누락. .env.local 또는 window.__NEXT_PUBLIC_ENV__ 확인.');
    }
    return null;
  }
  try {
    _supabaseClient = createBrowserClient(url, key, {
      auth: { lock: async (_name, _acquireTimeout, fn) => fn() },
    });
    return _supabaseClient;
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Supabase 브라우저 클라이언트 초기화 실패:', err);
    }
    return null;
  }
}

/** 브라우저 Supabase 클라이언트 (지연 초기화 — window.__NEXT_PUBLIC_ENV__ 설정 후 사용) */
export const supabase: SupabaseClient | null =
  typeof window === 'undefined' ? null : getBrowserClient();

/** placeholder/예시 키면 Invalid API key 유발 → null 반환 */
const PLACEHOLDER_SERVICE_KEYS = [
  'your-service-role-key',
  'placeholder-service-role-key',
  'your-project.supabase.co',
];
function isPlaceholderServiceKey(key: string): boolean {
  const k = key?.trim().toLowerCase() || '';
  if (!k || k.length < 20) return true;
  return PLACEHOLDER_SERVICE_KEYS.some((p) => k.includes(p));
}

/**
 * Supabase 환경 변수 유효성 검사.
 * 환경 변수가 없거나 잘못된 경우 친절한 에러 메시지와 함께 throw.
 * 500 에러 대신 구체적인 설정 안내를 제공하기 위해 API 라우트 초반에 호출하세요.
 *
 * @throws Error 환경 변수가 없거나 placeholder/예시 값인 경우
 */
export function validateSupabaseEnv(): void {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = rawUrl?.trim() ?? '';
  const serviceKey = getServiceRoleKey();

  if (!url || !serviceKey || isPlaceholderServiceKey(serviceKey) || url.includes('your-project.supabase.co')) {
    throw new Error(getServerClientErrorHint());
  }
}

/**
 * 서버용 Supabase 클라이언트 생성 실패 시 사용자에게 보여줄 구체적인 안내 문구 반환.
 * API 라우트에서 createServerClient()가 null일 때 이 안내를 응답에 넣으면 됨.
 */
export function getServerClientErrorHint(): string {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const url = rawUrl?.trim() ?? '';
  const serviceKey = getServiceRoleKey();

  const envHint = process.env.NETLIFY
    ? 'Netlify 대시보드 > Site settings > Environment variables에서 설정 후 재배포하세요.'
    : 'admin-web/.env 또는 .env.local에 설정하고 개발 서버를 재시작하세요.';

  if (!url) {
    return `NEXT_PUBLIC_SUPABASE_URL를 ${envHint}`;
  }
  if (url.includes('your-project.supabase.co')) {
    return 'NEXT_PUBLIC_SUPABASE_URL가 예시 값입니다. Supabase 대시보드의 실제 프로젝트 URL로 교체한 뒤 재배포하세요.';
  }
  if (!serviceKey) {
    return `SUPABASE_SERVICE_ROLE_KEY(또는 SERVICE_ROLE_KEY)를 ${envHint}`;
  }
  if (serviceKey.length < 20) {
    return 'SUPABASE_SERVICE_ROLE_KEY가 너무 짧습니다. Supabase 대시보드 > Settings > API에서 service_role 키를 복사해 넣고 개발 서버를 재시작하세요.';
  }
  if (PLACEHOLDER_SERVICE_KEYS.some((p) => serviceKey.toLowerCase().includes(p))) {
    return 'SUPABASE_SERVICE_ROLE_KEY가 예시/플레이스홀더 값입니다. Supabase 대시보드 > Settings > API의 service_role 키로 교체한 뒤 개발 서버를 재시작하세요.';
  }
  return 'Supabase 키 형식을 확인하고 개발 서버를 재시작하세요. (진단: /api/debug/supabase-env)';
}

/**
 * 환경 변수 검증 후 서버 클라이언트 반환.
 * 환경 변수가 없으면 500 대신 친절한 에러 메시지를 담은 Error를 throw.
 * API 라우트에서 try/catch로 잡아 NextResponse.json({ error: e.message }, { status: 503 })으로 반환하면 됨.
 */
export function createServerClientOrThrow(): SupabaseClient {
  validateSupabaseEnv();
  const client = createServerClient();
  if (!client) {
    throw new Error(getServerClientErrorHint());
  }
  return client;
}

/**
 * 배포 시 SUPABASE_SERVICE_ROLE_KEY 대신 SERVICE_ROLE_KEY로 설정된 경우 대비 fallback.
 * Netlify/Vercel 등에서 환경변수명이 꼬였을 수 있음.
 */
function getServiceRoleKey(): string {
  const primary = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? '';
  if (primary) return primary;
  const fallback = process.env.SERVICE_ROLE_KEY?.trim() ?? '';
  return fallback;
}

// 서버 컴포넌트용 (service role key 사용 시)
export function createServerClient(): SupabaseClient | null {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = getServiceRoleKey();
  const url = rawUrl?.trim() ?? '';

  if (!url || !serviceKey || isPlaceholderServiceKey(serviceKey) || url.includes('your-project.supabase.co')) {
    if (process.env.NODE_ENV === 'development' || process.env.VERCEL_ENV || process.env.NETLIFY) {
      const reason = !url
        ? 'NEXT_PUBLIC_SUPABASE_URL'
        : !serviceKey
          ? 'SUPABASE_SERVICE_ROLE_KEY'
          : isPlaceholderServiceKey(serviceKey)
            ? 'SUPABASE_SERVICE_ROLE_KEY(플레이스홀더)'
            : 'NEXT_PUBLIC_SUPABASE_URL(your-project)';
      console.warn(`⚠️ Supabase 서버 환경변수 미설정: ${reason}`);
    }
    return null;
  }

  try {
    return createClient(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.warn('⚠️ Supabase 서버 클라이언트 초기화 실패:', err);
    }
    return null;
  }
}

// Supabase 설정 여부 확인 헬퍼
export const isSupabaseConfigured = (): boolean =>
  Boolean(
    getSupabaseEnv('NEXT_PUBLIC_SUPABASE_URL') && getSupabaseEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  );

/** 설정된 경우에만 클라이언트 반환, 없으면 throw (lib/api 등에서 사용) */
export function getSupabase(): SupabaseClient {
  const client = typeof window !== 'undefined' ? getBrowserClient() : null;
  if (!client) {
    throw new Error('Supabase가 설정되지 않았습니다.');
  }
  return client;
}

/** 서버(API 라우트)에서는 createServerClient, 브라우저에서는 supabase 반환 */
export function getSupabaseOrServer(): SupabaseClient {
  if (typeof window !== 'undefined') {
    const client = getBrowserClient();
    if (client) return client;
  }
  const server = createServerClient();
  if (server) return server;
  throw new Error(getServerClientErrorHint());
}
