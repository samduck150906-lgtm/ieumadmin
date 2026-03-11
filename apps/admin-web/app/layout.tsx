import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { ToastProvider } from '@/components/ToastProvider';
import { AppErrorBoundaryWrapper } from '@/components/AppErrorBoundaryWrapper';
import { BuildStamp } from '@/components/BuildStamp';
import { FirebaseAnalytics } from '@/components/FirebaseAnalytics';
import QueryProvider from '@/components/providers/QueryProvider';
import { SidebarStateProvider } from '@/components/SidebarStateProvider';
import { SupabaseGuard } from '@/components/SupabaseGuard';

const adminBaseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://admin.ieum.in';

export const metadata: Metadata = {
  title: '이음 관리자',
  description: '이음 - 이사 서비스 연결 플랫폼 관리 시스템',
  icons: {
    icon: '/favicon.png',
    apple: '/favicon.png',
  },
  openGraph: {
    title: '이음 관리자',
    description: '이음 이사 서비스 연결 플랫폼 관리 시스템',
    type: 'website',
    url: adminBaseUrl,
    siteName: '이음',
    locale: 'ko_KR',
    images: [
      {
        url: process.env.NEXT_PUBLIC_OG_IMAGE_URL || `${adminBaseUrl}/logo.png`,
        width: 1200,
        height: 630,
        alt: '이음 관리자',
      },
    ],
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover' as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const publicEnv = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL || '',
  };
  return (
    <html lang="ko" data-theme="dashboard" suppressHydrationWarning data-env={JSON.stringify(publicEnv)}>
      <head>
        {/* data-env로 주입한 env를 window에 복사 (스크립트 실행 순서 이슈 회피) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement.getAttribute('data-env');if(d)try{window.__NEXT_PUBLIC_ENV__=JSON.parse(d);}catch(e){}})();`,
          }}
        />
        {/* 외부 폰트: 절대 URL 사용 — 중첩 라우트(/members/realtors/signup 등)에서도 안전하게 로드 */}
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/sun-typeface/SUIT/fonts/variable/css/suit.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/npm/jetbrains-mono@1.0.6/css/jetbrains-mono.min.css"
        />
      </head>
      <body className="font-sans antialiased bg-bg-page text-[color:var(--color-neutral-900)] overflow-x-hidden" suppressHydrationWarning>
        <div id="__app-root" suppressHydrationWarning>
        <AppErrorBoundaryWrapper>
          <SupabaseGuard>
            <QueryProvider>
              <AuthProvider>
                <SidebarStateProvider>
                  <ToastProvider>
                    {children}
                    <FirebaseAnalytics />
                    <BuildStamp />
                  </ToastProvider>
                </SidebarStateProvider>
              </AuthProvider>
            </QueryProvider>
          </SupabaseGuard>
        </AppErrorBoundaryWrapper>
        </div>
      </body>
    </html>
  );
}
