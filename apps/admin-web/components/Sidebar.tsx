'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { LogOut, X, ChevronDown, ChevronRight, PanelLeftClose, PanelLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { showError } from '@/lib/toast';
import { getRoleTitle } from '@/lib/admin-nav';
import { ADMIN_NAV_ITEMS, ADMIN_SPEC_NAV_ITEMS, NavItem } from '@/lib/admin-nav';

function groupNavItems(items: NavItem[]): { groupLabel: string | null; items: NavItem[] }[] {
  const groups: { groupLabel: string | null; items: NavItem[] }[] = [];
  let currentLabel: string | null = null;
  for (const item of items) {
    if (item.groupLabel) {
      currentLabel = item.groupLabel;
      groups.push({ groupLabel: currentLabel, items: [item] });
    } else {
      if (groups.length === 0) {
        groups.push({ groupLabel: null, items: [item] });
      } else if (groups[groups.length - 1].groupLabel === null) {
        groups[groups.length - 1].items.push(item);
      } else {
        groups.push({ groupLabel: null, items: [item] });
      }
    }
  }
  return groups;
}

export interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
  mode?: 'desktop' | 'mobile' | 'drawer';
  /** 데스크톱에서 사이드바 접힘(아이콘만) */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
}

function SidebarBrand({
  onClose,
  dark,
  collapsed,
  roleTitle,
}: {
  onClose?: () => void;
  dark?: boolean;
  collapsed?: boolean;
  roleTitle?: string;
}) {
  if (dark) {
    return (
      <div
        className={`admin-sidebar-brand flex-shrink-0 flex items-center min-w-0 ${collapsed ? 'collapsed' : ''}`}
        style={{ gap: collapsed ? 0 : 14 }}
      >
        <div className="flex items-center min-w-0" style={{ gap: collapsed ? 0 : 14 }}>
          <div className="admin-sidebar-brand-logo" aria-hidden>
            <Image src="/logo.png" alt="이음" width={44} height={44} className="w-full h-full object-contain" />
          </div>
          {!collapsed && (
            <div className="min-w-0 flex flex-col">
              <span className="admin-sidebar-brand-title truncate">이음 {roleTitle ?? 'Admin'}</span>
              <span className="admin-sidebar-brand-badge">{roleTitle ?? 'Admin'}</span>
            </div>
          )}
        </div>
        {onClose && !collapsed && (
          <button type="button" onClick={onClose} aria-label="메뉴 닫기" className="admin-sidebar-close-btn">
            <X style={{ width: 20, height: 20 }} strokeWidth={2} />
          </button>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center h-16 flex-shrink-0 px-4 border-b border-neutral-200 bg-white">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden bg-[#E8F3FF] border border-[#CCE5FF]">
          <Image src="/logo.png" alt="이음" width={40} height={40} className="w-full h-full object-contain" />
        </div>
        <div className="min-w-0 flex flex-col gap-0.5">
          <span className="font-bold text-sm text-neutral-800 truncate">이음 {roleTitle ?? 'Admin'}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md w-fit text-[#1B64DA] bg-[#E8F3FF]">{roleTitle ?? 'Admin'}</span>
        </div>
      </div>
    </div>
  );
}

function isPathMatch(pathname: string, href: string, exact?: boolean): boolean {
  const path = (pathname ?? '').replace(/\/$/, '') || '/';
  const itemPath = href.split('?')[0].replace(/\/$/, '') || href;
  if (exact) return path === itemPath;
  return path === itemPath || (itemPath !== '/admin' && path.startsWith(itemPath + '/'));
}

function isSubItemActive(pathname: string, searchParams: URLSearchParams | null, subHref: string): boolean {
  const path = (pathname ?? '').replace(/\/$/, '') || '/';
  const [subPath, subQuery] = subHref.split('?');
  const subPathNorm = subPath.replace(/\/$/, '') || subPath;
  if (path !== subPathNorm) return false;
  if (!subQuery) return true;
  const params = searchParams ?? new URLSearchParams();
  const status = params.get('status');
  if (subQuery.includes('status=')) {
    const expected = subQuery.split('status=')[1]?.split('&')[0] ?? '';
    return status === expected;
  }
  return true;
}

export default function Sidebar({
  mobileOpen = false,
  onMobileClose,
  mode = 'desktop',
  collapsed = false,
  onCollapsedChange,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, session, signOut } = useAuth();
  const roleTitle = user ? getRoleTitle(user.role) : undefined;
  const isAdmin = user?.role === 'admin';
  const isSpecAdmin = pathname === '/admin' || (pathname?.startsWith('/admin/') ?? false);
  const navItems = isSpecAdmin ? ADMIN_SPEC_NAV_ITEMS : ADMIN_NAV_ITEMS;
  const canSeeAdminNav = Boolean(user && (user.role === 'admin' || user.role === 'staff'));
  const visibleNav = useMemo(
    () => (canSeeAdminNav ? navItems.filter((item) => !item.adminOnly || isAdmin) : []),
    [canSeeAdminNav, navItems, isAdmin]
  );
  const [pendingApplicationCount, setPendingApplicationCount] = useState<number>(0);

  useEffect(() => {
    if (!user) return;
    const headers: HeadersInit = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};
    fetch('/api/partner-applications?status=pending&limit=1&page=1', { headers })
      .then((res) => res.json())
      .then((data) => setPendingApplicationCount(data.total ?? 0))
      .catch(() => {
        showError('가입 신청 건수를 불러오지 못했습니다.');
      });
  }, [user, session?.access_token]);

  const navItemsWithBadge = useMemo(() => {
    return visibleNav.map((item): NavItem => {
      if (item.subItems) {
        const subItems = item.subItems.map((sub) =>
          sub.href === '/partner-applications' && pendingApplicationCount > 0
            ? { ...sub, badge: pendingApplicationCount }
            : sub
        );
        return { ...item, subItems };
      }
      if (item.href === '/partner-applications' && pendingApplicationCount > 0) {
        return { ...item, badge: pendingApplicationCount };
      }
      return item;
    });
  }, [visibleNav, pendingApplicationCount]);

  const groups = useMemo(() => groupNavItems(navItemsWithBadge), [navItemsWithBadge]);

  const allGroupLabels = useMemo(
    () => new Set(groups.map((g) => g.groupLabel).filter((l): l is string => l != null)),
    [groups]
  );

  // pathname 기준으로 열려 있어야 할 서브메뉴/그룹을 렌더 시점에 파생 (useEffect 제거 → 깜빡임 방지)
  const baseOpenSubMenus = useMemo(() => {
    const next = new Set<string>();
    groups.forEach((g) => {
      g.items.forEach((item) => {
        if (item.subItems) {
          const anyActive =
            isPathMatch(pathname ?? '', item.href, item.exactMatch) ||
            item.subItems.some((sub) => isSubItemActive(pathname ?? '', searchParams, sub.href));
          if (anyActive) next.add(item.name);
        }
      });
    });
    return next;
  }, [pathname, searchParams, groups]);

  const baseOpenGroups = useMemo(() => new Set(allGroupLabels), [allGroupLabels]);

  const [userClosedSubMenus, setUserClosedSubMenus] = useState<Set<string>>(() => new Set());
  const [userOpenedSubMenus, setUserOpenedSubMenus] = useState<Set<string>>(() => new Set());
  const [userClosedGroups, setUserClosedGroups] = useState<Set<string>>(() => new Set());
  const [userOpenedGroups, setUserOpenedGroups] = useState<Set<string>>(() => new Set());

  const openSubMenus = useMemo(
    () =>
      new Set(
        [...baseOpenSubMenus, ...userOpenedSubMenus].filter((name) => !userClosedSubMenus.has(name))
      ),
    [baseOpenSubMenus, userOpenedSubMenus, userClosedSubMenus]
  );

  const openGroups = useMemo(
    () =>
      new Set(
        [...baseOpenGroups, ...userOpenedGroups].filter((label) => !userClosedGroups.has(label))
      ),
    [baseOpenGroups, userOpenedGroups, userClosedGroups]
  );

  const toggleSubMenu = (name: string) => {
    const isOpen = openSubMenus.has(name);
    const inBase = baseOpenSubMenus.has(name);
    setUserClosedSubMenus((prev) => {
      const next = new Set(prev);
      if (isOpen && inBase) next.add(name);
      else next.delete(name);
      return next;
    });
    setUserOpenedSubMenus((prev) => {
      const next = new Set(prev);
      if (!isOpen) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const toggleGroup = (label: string) => {
    const isOpen = openGroups.has(label);
    const inBase = baseOpenGroups.has(label);
    setUserClosedGroups((prev) => {
      const next = new Set(prev);
      if (isOpen && inBase) next.add(label);
      else next.delete(label);
      return next;
    });
    setUserOpenedGroups((prev) => {
      const next = new Set(prev);
      if (!isOpen) next.add(label);
      else next.delete(label);
      return next;
    });
  };

  const isDesktop = mode === 'desktop';
  const isDrawer = mode === 'drawer';
  const dark = isDesktop || isDrawer;

  const renderLink = (
    item: NavItem,
    onNavigate?: () => void,
    opts?: { isSub?: boolean; subHref?: string }
  ) => {
    const href = opts?.subHref ?? item.href;
    const isActive = opts?.subHref
      ? isSubItemActive(pathname ?? '', searchParams, opts.subHref)
      : isPathMatch(pathname ?? '', item.href, item.exactMatch);

    const badge = (opts?.subHref && item.subItems?.find((s) => s.href === opts.subHref)?.badge) ?? item.badge;

    if (dark) {
      return (
        <Link
          href={href}
          onClick={() => onNavigate?.()}
          className={`admin-sidebar-nav-link ${isActive ? 'active' : ''} ${collapsed ? 'justify-center px-2' : ''}`}
          title={collapsed ? item.name : undefined}
        >
          <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} strokeWidth={2} />
          {!collapsed && (
            <>
              <span className="whitespace-nowrap min-w-0 flex-1">{item.name}</span>
              {badge != null && Number(badge) > 0 && (
                <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 6px', backgroundColor: '#3182F6', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {badge}
                </span>
              )}
            </>
          )}
        </Link>
      );
    }

    return (
      <Link
        href={href}
        onClick={() => onNavigate?.()}
        className={`flex items-center gap-2.5 rounded-xl text-sm w-full min-h-[44px] ${collapsed ? 'justify-center px-2 py-2.5' : 'px-4 py-2.5'} ${isActive ? 'bg-primary-50 text-primary-700 font-semibold border-l-[3px] border-primary-600 pl-[calc(0.75rem-3px)]' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800'}`}
        title={collapsed ? item.name : undefined}
      >
        <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
        {!collapsed && (
          <>
            <span className="whitespace-nowrap min-w-0">{item.name}</span>
            {badge != null && Number(badge) > 0 && (
              <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-primary-500 text-white text-[10px] font-bold rounded-full">
                {badge}
              </span>
            )}
          </>
        )}
      </Link>
    );
  };

  const renderItem = (item: NavItem, onNavigate?: () => void) => {
    if (item.subItems && item.subItems.length > 0) {
      const isOpen = openSubMenus.has(item.name);
      const isParentActive =
        isPathMatch(pathname ?? '', item.href, item.exactMatch) ||
        item.subItems.some((sub) => isSubItemActive(pathname ?? '', searchParams, sub.href));

      if (collapsed) {
        return (
          <div key={item.name}>
            <Link
              href={item.href}
              onClick={() => onNavigate?.()}
              className={`admin-sidebar-nav-link justify-center px-2 ${isParentActive ? 'active' : ''}`}
              title={item.name}
            >
              <item.icon style={{ width: 16, height: 16 }} strokeWidth={2} />
            </Link>
          </div>
        );
      }

      if (dark) {
        return (
          <div key={item.name} style={{ marginBottom: 2 }}>
            <button
              type="button"
              onClick={() => toggleSubMenu(item.name)}
              className={`admin-sidebar-nav-btn ${isParentActive ? 'active' : ''}`}
            >
              <item.icon style={{ width: 16, height: 16, flexShrink: 0 }} strokeWidth={2} />
              <span className="flex-1 text-left whitespace-nowrap min-w-0">{item.name}</span>
              {isOpen ? <ChevronDown style={{ width: 14, height: 14 }} /> : <ChevronRight style={{ width: 14, height: 14 }} />}
            </button>
            {isOpen && (
              <ul style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 2, marginLeft: 16, paddingLeft: 12, borderLeft: '1px solid rgba(255,255,255,0.2)' }}>
                {item.subItems.map((sub) => (
                  <li key={sub.href}>
                    <Link
                      href={sub.href}
                      onClick={() => onNavigate?.()}
                      className={`admin-sidebar-sub-link ${isSubItemActive(pathname ?? '', searchParams, sub.href) ? 'active' : ''}`}
                    >
                      <span className="whitespace-nowrap min-w-0 flex-1">{sub.name}</span>
                      {sub.badge != null && Number(sub.badge) > 0 && (
                        <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 6px', backgroundColor: '#3182F6', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9999, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                          {sub.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }

      return (
        <div key={item.name} className="mb-0.5">
          <button
            type="button"
            onClick={() => toggleSubMenu(item.name)}
            className={`flex items-center gap-2.5 w-full px-4 py-2.5 rounded-xl text-sm min-h-[44px] ${isParentActive ? 'bg-primary-50 text-primary-700 font-semibold' : 'text-neutral-600 hover:bg-neutral-50 hover:text-neutral-800'}`}
          >
            <item.icon className="h-4 w-4 flex-shrink-0" strokeWidth={2} />
            <span className="flex-1 text-left whitespace-nowrap min-w-0">{item.name}</span>
            {isOpen ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0" />}
          </button>
          {isOpen && (
            <ul className="flex flex-col gap-0.5 mt-0.5 ml-4 pl-3 border-l border-neutral-200">
              {item.subItems.map((sub) => (
                <li key={sub.href}>
                  <Link
                    href={sub.href}
                    onClick={() => onNavigate?.()}
                    className={`flex items-center gap-2 py-2 px-2 rounded-lg text-sm min-h-[44px] ${isSubItemActive(pathname ?? '', searchParams, sub.href) ? 'text-primary-700 font-medium bg-primary-50/50' : 'text-neutral-500 hover:text-neutral-700 hover:bg-neutral-50'}`}
                  >
                    <span className="whitespace-nowrap min-w-0">{sub.name}</span>
                    {sub.badge != null && Number(sub.badge) > 0 && (
                      <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-primary-500 text-white text-[10px] font-bold rounded-full">
                        {sub.badge}
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }

    return (
      <li key={`${item.name}-${item.href}`}>
        {renderLink(item, onNavigate)}
      </li>
    );
  };

  const renderLinks = (onNavigate?: () => void) => {
    return (
      <>
        <div className={dark ? 'admin-sidebar-content flex flex-col' : 'flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-0.5 px-2 py-3 bg-white'}>
          {groups.map(({ groupLabel, items }, gi) => (
            <div key={gi} style={{ marginBottom: 8 }}>
              {groupLabel != null && !collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(groupLabel)}
                  className={dark ? 'admin-sidebar-group-btn' : 'w-full flex items-center gap-2 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider rounded-xl cursor-pointer min-h-[36px] text-neutral-400 hover:bg-neutral-50 hover:text-neutral-600'}
                >
                  {openGroups.has(groupLabel) ? (
                    <ChevronDown style={{ width: 14, height: 14, flexShrink: 0 }} />
                  ) : (
                    <ChevronRight style={{ width: 14, height: 14, flexShrink: 0 }} />
                  )}
                  <span>{groupLabel}</span>
                </button>
              )}
              {groupLabel != null && openGroups.has(groupLabel) && !collapsed && (
                <ul className="flex flex-col gap-0.5 mt-0.5">
                  {items.map((item) => renderItem(item, onNavigate))}
                </ul>
              )}
              {groupLabel == null && (
                <ul className="flex flex-col gap-0.5">
                  {items.map((item) => renderItem(item, onNavigate))}
                </ul>
              )}
            </div>
          ))}
        </div>

        <div className={dark ? 'admin-sidebar-footer' : 'flex-shrink-0 p-3 border-t border-neutral-200 bg-white'}>
          {canSeeAdminNav && user && !collapsed && (
            <div className="flex items-center gap-3 px-2 py-2 mb-2 rounded-xl" style={dark ? {} : undefined}>
              <div style={{ width: 32, height: 32, borderRadius: 9999, backgroundColor: '#3182F6', color: '#fff', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {user.name?.charAt(0) || 'A'}
              </div>
              <div className="min-w-0">
                <p className={dark ? 'admin-sidebar-user-name truncate leading-tight' : 'text-xs font-semibold truncate leading-tight text-neutral-800'}>{user.name}</p>
                <p className={dark ? 'admin-sidebar-user-role' : 'text-[10px] leading-tight mt-0.5 text-neutral-400'}>{roleTitle ?? ''}</p>
              </div>
            </div>
          )}
          {onCollapsedChange && isDesktop && (
            <button
              type="button"
              onClick={() => onCollapsedChange(!collapsed)}
              className={`admin-sidebar-footer-btn ${collapsed ? 'justify-center px-2' : ''}`}
              style={{ marginBottom: 8 }}
              aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
              data-testid="sidebar-toggle"
            >
              {collapsed ? <PanelLeft style={{ width: 16, height: 16 }} /> : <><PanelLeftClose style={{ width: 16, height: 16 }} /><span>접기</span></>}
            </button>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className={`admin-sidebar-footer-btn ${collapsed ? 'justify-center px-2' : ''}`}
            aria-label="로그아웃"
          >
            <LogOut style={{ width: 16, height: 16 }} strokeWidth={2} />
            {!collapsed && <span>로그아웃</span>}
          </button>
        </div>
      </>
    );
  };

  if (isDrawer) {
    return (
      <>
        <div
          className={`sidebar-drawer-overlay ${mobileOpen ? '' : 'hidden'}`}
          onClick={() => onMobileClose?.()}
          aria-hidden
        />
        <aside
          className={`admin-sidebar sidebar-drawer ${mobileOpen ? 'open' : ''}`}
          aria-modal={mobileOpen ? true : undefined}
          role="dialog"
          aria-label="메인 메뉴"
        >
          <SidebarBrand onClose={onMobileClose} dark roleTitle={roleTitle} />
          {renderLinks(onMobileClose)}
        </aside>
      </>
    );
  }

  return (
    <aside
      className={`admin-sidebar desktop ${collapsed ? 'collapsed' : ''}`}
      aria-label="메인 메뉴"
      role="navigation"
    >
      <SidebarBrand dark collapsed={collapsed} roleTitle={roleTitle} />
      {renderLinks()}
    </aside>
  );
}
