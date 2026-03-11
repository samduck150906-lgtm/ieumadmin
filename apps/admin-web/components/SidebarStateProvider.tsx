'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState } from 'react';

const SIDEBAR_COLLAPSED_KEY = 'ieum-admin-sidebar-collapsed';

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
  } catch {
    return false;
  }
}

interface SidebarStateContextValue {
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (value: boolean) => void;
}

const SidebarStateContext = createContext<SidebarStateContextValue | null>(null);

export function SidebarStateProvider({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setCollapsedState] = useState(false);

  useLayoutEffect(() => {
    setCollapsedState(readCollapsed());
  }, []);

  const setSidebarCollapsed = useCallback((value: boolean) => {
    setCollapsedState(value);
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(value));
    } catch {}
  }, []);

  const value = useMemo<SidebarStateContextValue>(
    () => ({ sidebarCollapsed, setSidebarCollapsed }),
    [sidebarCollapsed, setSidebarCollapsed]
  );

  return (
    <SidebarStateContext.Provider value={value}>
      {children}
    </SidebarStateContext.Provider>
  );
}

export function useSidebarState(): SidebarStateContextValue {
  const ctx = useContext(SidebarStateContext);
  if (!ctx) {
    return {
      sidebarCollapsed: false,
      setSidebarCollapsed: () => {},
    };
  }
  return ctx;
}
