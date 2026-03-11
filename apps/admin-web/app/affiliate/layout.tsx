'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { LogOut, Menu, X } from 'lucide-react';
import { AFFILIATE_NAV_ITEMS } from '@/lib/admin-nav';

interface AffiliateUser {
  id: string;
  businessName: string;
}

export default function AffiliateLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AffiliateUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pathname?.startsWith('/affiliate')) {
      document.title = pathname === '/affiliate/dashboard' ? '대시보드 | 이음 제휴업체' : '이음 제휴업체';
    }
  }, [pathname]);

  async function checkAuth() {
    if (!supabase) {
      setLoading(false);
      router.push('/login');
      return;
    }

    const {
      data: { user: authUser },
    } = await supabase.auth.getUser();
    if (!authUser) {
      setLoading(false);
      router.push('/login');
      return;
    }

    const { data: userData } = await supabase
      .from('users')
      .select('id, role')
      .eq('id', authUser.id)
      .single();

    if (!userData || userData.role !== 'partner') {
      setLoading(false);
      if (userData?.role === 'realtor') {
        router.replace('/agent');
        return;
      }
      router.push('/login');
      return;
    }

    const { data: partner } = await supabase
      .from('partners')
      .select('id, business_name')
      .eq('user_id', authUser.id)
      .single();

    if (!partner) {
      router.push('/login');
      setLoading(false);
      return;
    }

    setUser({
      id: authUser.id,
      businessName: partner.business_name || '',
    });
    setLoading(false);
  }

  async function handleLogout() {
    try {
      await supabase?.auth.signOut();
    } catch (e) {
      console.warn('[affiliate] signOut 오류:', e);
    }
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    } else {
      router.push('/login');
    }
  }

  if (loading) {
    return (
      <div className="admin-loading-wrap">
        <div className="admin-loading-inner">
          <div className="loading-spinner-circle" />
          <p className="admin-loading-text">로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="partner-root">
      {sidebarOpen && (
        <div
          className="partner-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside className={`partner-sidebar ${sidebarOpen ? 'open' : ''}`}>
        <div className="partner-sidebar-brand">
          <div className="partner-sidebar-brand-inner">
            <div className="partner-sidebar-logo">
              <Image src="/logo.png" alt="이음" width={36} height={36} className="w-full h-full object-contain" />
            </div>
            <div className="partner-sidebar-title-wrap">
              <h1 className="partner-sidebar-title">이음 제휴업체</h1>
              <p className="partner-sidebar-subtitle">제휴업체 전용</p>
            </div>
          </div>
        </div>

        <div className="partner-sidebar-user-block">
          <p className="partner-sidebar-user-name">{user?.businessName}</p>
        </div>

        <div className="partner-sidebar-close-row">
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="partner-sidebar-close-btn"
          >
            <X strokeWidth={2} />
            메뉴 닫기
          </button>
        </div>

        <nav className="partner-nav" aria-label="메인 메뉴">
          <ul className="partner-nav-list">
            {AFFILIATE_NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={`partner-nav-link ${isActive ? 'active' : ''}`}
                  >
                    <span className="partner-nav-link-icon" aria-hidden>
                      <Icon strokeWidth={2} />
                    </span>
                    <span className="partner-nav-link-text">{item.name}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="partner-sidebar-footer">
          <button type="button" onClick={handleLogout} className="partner-logout-btn">
            <LogOut strokeWidth={2} />
            <span>로그아웃</span>
          </button>
        </div>
      </aside>

      <main className="partner-main">
        <header className="partner-header">
          <button
            type="button"
            className="partner-header-menu-btn"
            onClick={() => setSidebarOpen(true)}
            aria-label="메뉴 열기"
          >
            <Menu />
          </button>
          <div className="partner-header-center">
            <div className="partner-header-logo-wrap">
              <Image src="/logo.png" alt="" width={28} height={28} className="partner-header-logo" />
            </div>
            <div>
              <span className="partner-header-title">이음 제휴업체</span>
              <span className="partner-header-subtitle">제휴 포털</span>
            </div>
          </div>
        </header>

        <div className="partner-content">
          <p className="sr-only">제휴업체 전용 포털 — 본인 업체 정보 및 견적만 확인 가능합니다.</p>
          {children}
        </div>
      </main>
    </div>
  );
}
