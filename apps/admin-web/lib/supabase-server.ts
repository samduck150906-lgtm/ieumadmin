/**
 * 서버 전용 Supabase 클라이언트 (SUPABASE_SERVICE_ROLE_KEY 사용).
 * API 라우트, 미들웨어, cron 등에서만 import하고, 클라이언트 번들에 포함되지 않도록 함.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const PLACEHOLDER_PATTERNS = ['your-project.supabase.co', 'your-service-role-key', 'placeholder'];

function logEnvWarning(missing: string[]): void {
  const msg = `⚠️ [admin-web] Supabase 필수 환경변수 누락: ${missing.join(', ')}. 앱이 정상 동작하지 않을 수 있습니다. .env.local 또는 배포 대시보드에서 설정 후 재시작/재배포하세요.`;
  console.warn(msg);
}

export function createServerClient(): SupabaseClient | null {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim();

  const missing: string[] = [];
  if (!url || url.includes('your-project.supabase.co')) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey || PLACEHOLDER_PATTERNS.some((p) => serviceKey.toLowerCase().includes(p))) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY');
  }

  if (missing.length > 0) {
    logEnvWarning(missing);
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
