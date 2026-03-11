'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { LogOut, Menu, X } from 'lucide-react';
import { AGENT_NAV_ITEMS } from '@/lib/admin-nav';

interface AgentUser {
  id: string;
  businessName: string;
}

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<AgentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pathname?.startsWith('/agent')) {
      document.title = pathname === '/agent/dashboard' ? '대시보드 | 이음 공인중개사' : '이음 공인중개사';
    }
  }, [pathname]);

  async function checkAuth() {
    setError(null);
    if (!supabase) {
      setLoading(false);
      router.push('/login');
      return;
    }

    try {
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser();
      if (!authUser) {
        setLoading(false);
        router.push('/login');
        return;
      }

      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('id, role')
        .eq('id', authUser.id)
        .single();

      if (userError || !userData) {
        setLoading(false);
        setError(userError?.message || '사용자 정보를 불러오지 못했습니다.');
        return;
      }

      if (userData.role !== 'realtor') {
        setLoading(false);
        if (userData.role === 'partner') {
          router.replace('/partner/dashboard');
          return;
        }
        router.push('/login?error=' + encodeURIComponent('공인중개사 계정만 접근할 수 있습니다.'));
        return;
      }

      const { data: realtor, error: realtorError } = await supabase
        .from('realtors')
        .select('id, business_name')
        .eq('user_id', authUser.id)
        .single();

      if (realtorError || !realtor) {
        setLoading(false);
        setError(realtorError?.message || '공인중개사 정보를 불러오지 못했습니다.');
        return;
      }

      setUser({
        id: authUser.id,
        businessName: realtor.business_name || '',
      });
    } catch (e) {
      setLoading(false);
      setError(e instanceof Error ? e.message : '인증 확인 중 오류가 발생했습니다.');
      return;
    }
    setLoading(false);
  }

  async function handleLogout() {
    try {
      await supabase?.auth.signOut();
    } catch (e) {
      console.warn('[agent] signOut 오류:', e);
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

  if (error) {
    return (
      <div className="admin-loading-wrap">
        <div className="admin-loading-inner" style={{ flexDirection: 'column', gap: '16px' }}>
          <p className="admin-loading-text" style={{ color: '#dc2626' }}>{error}</p>
          <button
            type="button"
            onClick={() => { setError(null); setLoading(true); checkAuth(); }}
            className="btn btn-primary"
          >
            다시 시도
          </button>
          <button
            type="button"
            onClick={() => router.push('/login')}
            className="btn btn-outline"
          >
            로그인으로 이동
          </button>
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
              <h1 className="partner-sidebar-title">이음 공인중개사</h1>
              <p className="partner-sidebar-subtitle">공인중개사 전용</p>
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
            {AGENT_NAV_ITEMS.map((item) => {
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
              <span className="partner-header-title">이음 공인중개사</span>
              <span className="partner-header-subtitle">공인중개사 포털</span>
            </div>
          </div>
        </header>

        <div className="partner-content">
          <p className="sr-only">공인중개사 전용 포털 — 본인 매물·수익만 확인 가능합니다.</p>
          {children}
        </div>
      </main>
    </div>
  );
}
