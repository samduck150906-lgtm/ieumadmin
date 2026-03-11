'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { showError } from '@/lib/toast';
import { LogOut, Menu, Bell, X, Star } from 'lucide-react';
import { PARTNER_NAV_ITEMS, REALTOR_NAV_ITEMS } from '@/lib/admin-nav';

export type PartnerLayoutRole = 'partner' | 'realtor';

interface PartnerUser {
  id: string;
  partnerId: string;
  businessName: string;
  role: PartnerLayoutRole;
  unreadCount: number;
  mileageBalance: number;
}

export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<PartnerUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 제휴업체 전용 대시보드 정체성: 탭 제목을 관리자와 분리
  useEffect(() => {
    if (pathname?.startsWith('/partner/change-password')) {
      document.title = '비밀번호 변경 | 이음 파트너스';
      return;
    }
    const titles: Record<string, string> = {
      '/partner/dashboard': '대시보드',
      '/partner/unpaid-pay': '결제(미수 등)',
      '/partner/assignments': 'DB 관리',
      '/partner/db-list': 'DB 구매',
      '/partner/settlements': '내 수익 현황',
      '/partner/profile': '프로필',
      '/partner/change-password': '비밀번호 변경',
      '/partner/invite': '고객 초대',
      '/partner/invitations': '추천인 관리',
      '/partner/complaints': '민원',
      '/partner/payments': '결제',
      '/partner/mileage': '마일리지',
      '/partner/receivables': '미수금 관리',
      '/partner/matching': '제휴업체 매칭 현황',
      '/partner/properties': '내 매물 관리',
    };
    const base = '이음 파트너스';
    const normalized = pathname?.replace(/\/$/, '') || '';
    const pageTitle = titles[normalized];
    document.title = pageTitle ? `${pageTitle} | ${base}` : base;
  }, [pathname]);

  useEffect(() => {
    if (!supabase || !user?.partnerId) return;
    const channel = supabase
      .channel('partner-assignments')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'partner_assignments',
        },
        (payload: { new: { partner_id?: string } }) => {
          if (payload.new.partner_id === user.partnerId) {
            setUser((prev) => (prev ? { ...prev, unreadCount: prev.unreadCount + 1 } : prev));
          }
        }
      )
      .subscribe();
    return () => {
      channel.unsubscribe();
    };
  }, [user?.partnerId]);

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
        .select('id, role, force_password_change')
        .eq('id', authUser.id)
        .single();

      if (userError || !userData) {
        setLoading(false);
        setError(userError?.message || '사용자 정보를 불러오지 못했습니다.');
        return;
      }

      if (userData.role !== 'partner' && userData.role !== 'realtor') {
        setLoading(false);
        router.push('/login?error=' + encodeURIComponent('제휴업체·공인중개사 계정만 접근할 수 있습니다.'));
        return;
      }

      if (userData.force_password_change && !pathname?.startsWith('/partner/change-password')) {
        setLoading(false);
        router.replace('/partner/change-password');
        return;
      }

      // 제휴업체 또는 공인중개사 테이블에서 프로필 조회
      let profileId = '';
      let profileBusinessName = '';

      if (userData.role === 'partner') {
        const { data: partner, error: partnerError } = await supabase
          .from('partners')
          .select('id, business_name')
          .eq('user_id', authUser.id)
          .single();

        if (partnerError || !partner) {
          setLoading(false);
          setError(partnerError?.message || '제휴업체 정보를 불러오지 못했습니다.');
          return;
        }
        profileId = partner.id;
        profileBusinessName = partner.business_name || '';
      } else {
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
        profileId = realtor.id;
        profileBusinessName = realtor.business_name || '';
      }

      const { count } = await supabase
        .from('partner_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', profileId)
        .eq('status', 'unread');

      let mileageBalance = 0;
      try {
        const { data: mb } = await supabase
          .from('partner_mileage_balance')
          .select('balance')
          .eq('partner_id', profileId)
          .single();
        if (mb) mileageBalance = mb.balance;
      } catch (e) {
        const { captureError } = await import('@/lib/monitoring.client');
        captureError(e, { feature: 'partner-mileage-balance', partnerId: profileId });
        showError('마일리지 잔액을 불러오지 못했습니다.');
      }

      setUser({
        id: authUser.id,
        partnerId: profileId,
        businessName: profileBusinessName,
        role: userData.role as PartnerLayoutRole,
        unreadCount: count || 0,
        mileageBalance,
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
      console.warn('[partner] signOut 오류:', e);
    }
    // router.push만으로는 세션이 완전히 제거되지 않을 수 있어, 강제 새로고침으로 이동
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

  if (pathname?.startsWith('/partner/change-password')) {
    return <>{children}</>;
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
              <h1 className="partner-sidebar-title">이음 파트너스</h1>
              <p className="partner-sidebar-subtitle">
                {user?.role === 'realtor' ? '공인중개사 전용' : '제휴업체 전용'}
              </p>
            </div>
          </div>
        </div>

        <div className="partner-sidebar-user-block">
          <p className="partner-sidebar-user-name">{user?.businessName}</p>
          {user && user.mileageBalance > 0 && (
            <div className="partner-sidebar-mileage">
              <Star className="partner-sidebar-mileage-icon" strokeWidth={2} />
              <span className="partner-sidebar-mileage-text">
                마일리지 ₩{user.mileageBalance.toLocaleString()}
              </span>
            </div>
          )}
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
            {(user?.role === 'realtor' ? REALTOR_NAV_ITEMS : PARTNER_NAV_ITEMS).map((item) => {
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
                    {user?.role === 'partner' && item.href === '/partner/assignments' && user.unreadCount > 0 && (
                      <span className="partner-nav-badge">{user.unreadCount}</span>
                    )}
                    {user?.role === 'partner' && item.href === '/partner/db-list' && user.mileageBalance > 0 && (
                      <span className="partner-nav-mileage-badge">마일리지</span>
                    )}
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
              <span className="partner-header-title">이음 파트너스</span>
              <span className="partner-header-subtitle">제휴 포털</span>
            </div>
          </div>
          <div className="partner-header-noti">
            <Bell />
            {user && user.unreadCount > 0 && (
              <span className="partner-header-noti-badge">{user.unreadCount}</span>
            )}
          </div>
        </header>

        <div className="partner-content">
          <p className="sr-only">
            {user?.role === 'realtor' ? '공인중개사 전용 포털' : '제휴업체 전용 포털'} — 관리자 메뉴는 노출되지 않습니다.
          </p>
          {children}
        </div>
      </main>
    </div>
  );
}
