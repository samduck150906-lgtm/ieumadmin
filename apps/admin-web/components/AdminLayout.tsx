'use client';

import { ReactNode, useState, useEffect, Suspense } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Image from 'next/image';
import { useAuth } from '@/lib/auth';
import { useSidebarState } from '@/components/SidebarStateProvider';
import { getRoleTitle } from '@/lib/admin-nav';
import Sidebar from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { Loader2, Menu, Bell } from 'lucide-react';
import Link from 'next/link';

/** useSearchParams Suspense fallback — 레이아웃 시프트 방지 */
function SidebarFallback({ mode, collapsed }: { mode: 'desktop' | 'drawer'; collapsed?: boolean }) {
  if (mode === 'drawer') return null;
  return (
    <aside
      className={`admin-sidebar desktop ${collapsed ? 'collapsed' : ''}`}
      aria-hidden
      role="presentation"
    >
      <div className="admin-sidebar-brand flex-shrink-0 flex items-center min-w-0" style={{ gap: collapsed ? 0 : 14 }}>
        <div className="admin-sidebar-brand-logo" aria-hidden>
          <Image src="/logo.png" alt="" width={44} height={44} className="w-full h-full object-contain" />
        </div>
      </div>
      <div className="admin-sidebar-content flex flex-col flex-1 items-center justify-center py-8">
        <Loader2 className="animate-spin" style={{ width: 24, height: 24, color: 'rgba(255,255,255,0.6)' }} strokeWidth={2} />
      </div>
    </aside>
  );
}

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const { sidebarCollapsed, setSidebarCollapsed } = useSidebarState();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // 미인증: 로그인 페이지로 리다이렉트. OAuth 콜백 직후에는 클라이언트 세션 동기화를 위해 2초 대기 후 리다이렉트(무한 루프 방지).
  useEffect(() => {
    if (loading) return;
    if (!user) {
      const loginPath = '/login';
      const fromCallback =
        typeof window !== 'undefined' &&
        document.referrer.includes('/auth/callback');
      if (fromCallback) {
        // 콜백 직후: 세션 동기화 시간을 주고, 그래도 없으면 로그인으로
        let t2: ReturnType<typeof setTimeout> | null = null;
        const t = setTimeout(() => {
          if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
            router.replace(loginPath);
            t2 = setTimeout(() => {
              if (!window.location.pathname.startsWith('/login')) {
                window.location.replace(window.location.origin + loginPath);
              }
            }, 500);
          }
        }, 2000);
        return () => {
          clearTimeout(t);
          if (t2) clearTimeout(t2);
        };
      }
      router.replace(loginPath);
      const t = setTimeout(() => {
        if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
          window.location.replace(window.location.origin + loginPath);
        }
      }, 800);
      return () => clearTimeout(t);
    }
  }, [loading, user, router]);

  // 모바일에서 사이드바 열림 시 배경 스크롤 방지
  useEffect(() => {
    if (sidebarOpen && typeof window !== 'undefined' && window.matchMedia('(max-width: 1023px)').matches) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [sidebarOpen]);

  if (loading) {
    return (
      <div className="admin-loading-wrap">
        <div className="admin-loading-inner">
          <Loader2 className="admin-loading-spinner" strokeWidth={2} aria-hidden />
          <p className="admin-loading-text">로딩 중...</p>
        </div>
        <a href="/login" className="admin-loading-link">로그인 페이지로 이동</a>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="admin-loading-wrap">
        <div className="admin-loading-inner">
          <Loader2 className="admin-loading-spinner" style={{ width: 40, height: 40 }} strokeWidth={2} aria-hidden />
          <p className="admin-loading-text">로그인 페이지로 이동 중...</p>
        </div>
        <a href="/login" className="admin-loading-link">로그인 페이지로 바로 이동</a>
      </div>
    );
  }

  if (user.role !== 'admin' && user.role !== 'staff') {
    const redirectPath =
      pathname === '/admin/payments' ? '/partner/payments' : '/partner/dashboard';
    if (typeof window !== 'undefined') window.location.replace(redirectPath);
    return (
      <div className="admin-loading-wrap">
        <div className="admin-loading-inner">
          <Loader2 className="admin-loading-spinner" style={{ width: 40, height: 40 }} strokeWidth={2} aria-hidden />
          <p className="admin-loading-text">제휴업체 전용 페이지로 이동 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-root" data-theme="dashboard">
      <Suspense fallback={<SidebarFallback mode="desktop" collapsed={sidebarCollapsed} />}>
        <Sidebar
          mode="desktop"
          collapsed={sidebarCollapsed}
          onCollapsedChange={setSidebarCollapsed}
        />
        <Sidebar
          mode="drawer"
          mobileOpen={sidebarOpen}
          onMobileClose={() => setSidebarOpen(false)}
        />
      </Suspense>
      <div className={`admin-root-inner ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="admin-header">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="admin-header-menu-btn"
            aria-label="메뉴 열기"
            aria-expanded={sidebarOpen}
          >
            <Menu className="icon-5" strokeWidth={2} />
          </button>
          <h2 className="admin-header-title">
            {user ? `${getRoleTitle(user.role)} 대시보드` : '대시보드'}
          </h2>
          <div className="admin-header-spacer" />
          <div className="admin-header-actions">
            <Link
              href="/admin/notifications"
              className="admin-header-noti-link"
              aria-label="알림"
            >
              <Bell className="icon-5" />
              <span className="admin-header-noti-dot" aria-hidden />
            </Link>
            <div className="admin-header-user-wrap">
              <p className="admin-header-user-name">
                <strong>{user.name}</strong>님 환영합니다.
              </p>
              <p className="admin-header-user-role">{user ? getRoleTitle(user.role) : ''}</p>
            </div>
            <div className="admin-header-avatar">
              <span>{user.name?.charAt(0) || 'A'}</span>
            </div>
          </div>
        </header>

        <main className="admin-main">
          {children}
        </main>
        <MobileBottomNav onMenuOpen={() => setSidebarOpen(true)} />
      </div>
    </div>
  );
}
