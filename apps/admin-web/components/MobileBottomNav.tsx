'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { MOBILE_QUICK_NAV } from '@/lib/admin-nav';

interface MobileBottomNavProps {
  onMenuOpen: () => void;
}

/** 모바일 하단 네비 — 햄버거로 전체 메뉴(사이드바) 열기 + 핵심 4개 바로가기 */
export function MobileBottomNav({ onMenuOpen }: MobileBottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="mobile-bottom-nav" aria-label="모바일 메뉴">
      <div className="mobile-bottom-nav-inner">
        <button
          type="button"
          onClick={onMenuOpen}
          className="mobile-bottom-nav-menu-btn"
          aria-label="전체 메뉴 열기"
        >
          <Menu className="mobile-bottom-nav-menu-icon" strokeWidth={2} />
          <span className="mobile-bottom-nav-menu-label">메뉴</span>
        </button>
        {MOBILE_QUICK_NAV.map((item) => {
          const isActive = pathname === item.href || pathname?.startsWith(item.href + '/');
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`mobile-bottom-nav-link ${isActive ? 'active' : ''}`}
            >
              <item.icon className="mobile-bottom-nav-link-icon" strokeWidth={isActive ? 2.5 : 1.75} />
              <span className="mobile-bottom-nav-link-label">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
