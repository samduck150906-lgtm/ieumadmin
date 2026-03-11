'use client';

import { useState, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { checkRequiredEnv } from '@/lib/env';

/** Supabase 미설정 시에도 접근 허용 경로 (회원가입·협력업체 신청 등) */
const BYPASS_ENV_PATHS = ['/auth', '/members/partners/signup', '/members/realtors/signup', '/partner/apply'];

/**
 * 필수 환경 변수(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SITE_URL 등)가 없을 때 명확한 에러 메시지를 보여줍니다.
 * /auth, 회원가입 경로는 미설정 시에도 표시합니다 (체험·E2E용).
 *
 * Hydration 오류 방지: usePathname/checkRequiredEnv가 서버·클라이언트에서 다르게 동작할 수 있으므로
 * 마운트 전에는 항상 children을 렌더링하여 서버·클라이언트 HTML을 일치시킵니다.
 */
export function SupabaseGuard({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  const bypassEnv = BYPASS_ENV_PATHS.some((p) => pathname?.startsWith(p));
  const envCheck = checkRequiredEnv();

  if (!envCheck.ok && !bypassEnv) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 border border-gray-200">
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            환경 변수가 설정되지 않았습니다
          </h1>
          <p className="text-gray-600 mb-4">{envCheck.message}</p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 mb-4">
            <p className="font-medium mb-2">누락된 변수:</p>
            <ul className="list-disc list-inside space-y-1">
              {envCheck.missing.map((key) => (
                <li key={key} className="font-mono">{key}</li>
              ))}
            </ul>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-700 space-y-2 font-mono">
            <p>로컬 개발: <code className="bg-gray-200 px-1 rounded">.env.local</code>에 다음을 추가하세요.</p>
            <pre className="whitespace-pre-wrap break-all text-xs">
{`NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_SITE_URL=https://ieum2.netlify.app`}
            </pre>
            <p className="pt-2 border-t border-gray-200 text-gray-600">
              {typeof process !== 'undefined' && (process.env.NETLIFY || process.env.VERCEL)
                ? 'Netlify/Vercel 대시보드 → Environment Variables에서 설정 후 재배포하세요.'
                : 'admin-web/.env 또는 .env.local에 설정하고 개발 서버를 재시작하세요.'}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
