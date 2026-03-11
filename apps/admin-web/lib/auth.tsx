'use client';

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { getSupabase, isSupabaseConfigured } from './supabase';
import { isPublicSignupPath } from './middleware-routes';
import type { User, Session } from '@supabase/supabase-js';


interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  /** 출금 승인·완료·반려 가능 여부 (admin은 항상 true, staff는 직원 관리에서 정산 담당자로 지정된 경우만) */
  canApproveSettlement?: boolean;
}

interface AuthContextType {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signInWithKakao: (role?: 'partner' | 'realtor' | 'partner_apply') => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_CACHE_KEY = 'ieum_user_profile';

/**
 * 역할별 로그인 후 리다이렉트 경로.
 * DB user_role은 admin, staff, partner, realtor 유지. agent=realtor(공인중개사), affiliate=partner(제휴업체)는 경로/UI 별칭.
 */
const ROLE_REDIRECT_PATH: Record<string, string> = {
  admin: '/admin',
  staff: '/dashboard',
  partner: '/partner/dashboard',  // 제휴업체 전용 대시보드
  realtor: '/agent',               // 공인중개사(agent) 전용 진입
};
const AUTH_INIT_TIMEOUT_MS = 6_000;

/** 관리자 OAuth 콜백 기준 URL. Supabase Redirect URLs에 반드시 등록해야 함. */
const ADMIN_CALLBACK_BASE = 'https://ieum2.netlify.app';

/**
 * OAuth 콜백 URL. 관리자(admin-web) 전용 — 절대 랜딩(ieumm)으로 리다이렉트되지 않도록 방어.
 * Supabase Redirect URLs에 https://ieum2.netlify.app/auth/callback 등록 필수.
 */
const getAuthCallbackUrl = (): string => {
  const callback = `${ADMIN_CALLBACK_BASE}/auth/callback`;
  if (typeof window !== 'undefined') {
    const origin = window.location.origin.replace(/\/$/, '');
    // 현재 origin이 랜딩(ieumm)인 경우 — 관리자용이므로 admin URL 사용
    if (origin.includes('ieumm.netlify.app')) return callback;
    return `${origin}/auth/callback`;
  }
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || '';
  if (!siteUrl || siteUrl.includes('supabase.co')) return callback;
  // NEXT_PUBLIC_SITE_URL이 랜딩(ieumm)으로 잘못 설정된 경우 — 관리자용이므로 admin URL 사용
  if (siteUrl.includes('ieumm')) return callback;
  return `${siteUrl.replace(/\/$/, '')}/auth/callback`;
};

function getCachedProfile(): AuthUser | null {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PROFILE_CACHE_KEY) : null;
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function setCachedProfile(user: AuthUser | null) {
  try {
    if (typeof window === 'undefined') return;
    if (user) {
      localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // localStorage unavailable
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  // 사용자 프로필 로드
  const loadUserProfile = useCallback(async (userId: string, apply: (u: AuthUser | null) => void = setUser) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('users')
        .select('id, email, name, role')
        .eq('id', userId)
        .single();

      if (error) throw error;

      // 카카오 회원가입/협력업체 신청 페이지: 리다이렉트 생략 (폼 완료 대기)
      const p = pathname ?? '';
      if (p.includes('/partner/apply')) {
        apply(null);
        setCachedProfile(null);
        return; // 협력업체 신청 중 — 리다이렉트 없이 페이지 유지
      }
      if (p.includes('/members/partners/signup/kakao-complete')) {
        const { data: partnerRow } = await supabase
          .from('partners')
          .select('id')
          .eq('user_id', userId)
          .maybeSingle();
        if (!partnerRow) {
          apply(null);
          setCachedProfile(null);
          return; // 프로필 미완료 — 리다이렉트 없이 페이지 유지
        }
      }
      if (p.includes('/members/realtors/signup/kakao-complete')) {
        const { data: realtorRow } = await supabase
          .from('realtors')
          .select('id, business_name')
          .eq('user_id', userId)
          .maybeSingle();
        const incomplete =
          !realtorRow || !realtorRow.business_name || realtorRow.business_name === '미등록 사무소';
        if (incomplete) {
          apply(null);
          setCachedProfile(null);
          return; // 프로필 미완료 — 리다이렉트 없이 페이지 유지
        }
      }

      // 제휴업체/공인중개사: 역할별 리다이렉트 (OAuth 콜백 후 포함)
      if (data.role === 'partner' || data.role === 'realtor') {
        apply(null);
        setCachedProfile(null);
        router.push(ROLE_REDIRECT_PATH[data.role]);
        return;
      }

      // 관리자/스태프만 본사 대시보드 접근
      if (data.role !== 'admin' && data.role !== 'staff') {
        await getSupabase().auth.signOut();
        apply(null);
        setCachedProfile(null);
        return;
      }

      // admin은 항상 정산 승인 가능, staff는 직원 설정에 따라 결정
      let canApproveSettlement = data.role === 'admin';
      if (data.role === 'staff') {
        const { data: staffData } = await supabase
          .from('staff')
          .select('can_approve_settlement')
          .eq('user_id', userId)
          .single();
        canApproveSettlement = staffData?.can_approve_settlement ?? false;
      }

      const u: AuthUser = {
        id: data.id,
        email: data.email,
        name: data.name || data.email,
        role: data.role as 'admin' | 'staff',
        canApproveSettlement,
      };
      apply(u);
      setCachedProfile(u);
    } catch (err: unknown) {
      // 미가입 사용자(users 테이블에 없음): 세션 제거 후 로그인 유도
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code?: string }).code : undefined;
      if (code === 'PGRST116') {
        await getSupabase().auth.signOut();
        apply(null);
        setCachedProfile(null);
        return;
      }
      // DB 장애 시: 세션 제거 후 로그인 페이지로 리다이렉트 (조용한 실패 방지)
      console.error('[auth] loadUserProfile 실패:', err);
      await getSupabase().auth.signOut();
      apply(null);
      setCachedProfile(null);
      if (typeof window !== 'undefined') {
        const msg = encodeURIComponent('사용자 정보를 불러오지 못했습니다. 다시 로그인해 주세요.');
        window.location.href = `/login?error=${msg}&error_code=profile_load`;
      }
    }
  }, [router, pathname]);

  // 세션 확인 및 사용자 정보 로드
  useEffect(() => {
    let cancelled = false;

    const applyUser = (u: AuthUser | null) => {
      if (!cancelled) setUser(u);
    };
    const applyLoading = (v: boolean) => {
      if (!cancelled) setLoading(v);
    };

    const initAuth = async () => {
      try {
        if (!isSupabaseConfigured()) {
          applyLoading(false);
          return;
        }
        const supabase = getSupabase();
        // OAuth 콜백 직후: 쿠키에 세션이 먼저 반영될 수 있으므로 getSession() 먼저 시도
        const { data: { session: s } } = await supabase.auth.getSession();
        if (s?.user && !cancelled) {
          setSession(s);
          await loadUserProfile(s.user.id, applyUser);
          applyLoading(false);
          return;
        }
        // getUser()는 서버에서 JWT를 검증하므로 getSession()보다 보안적으로 안전
        const { data: { user: authUser } } = await supabase.auth.getUser();
        if (authUser) {
          const { data: { session: s2 } } = await supabase.auth.getSession();
          if (!cancelled && s2) setSession(s2);
          await loadUserProfile(authUser.id, applyUser);
        }
      } catch (error) {
        console.error('인증 초기화 오류:', error);
      } finally {
        applyLoading(false);
      }
    };

    // getUser 행(hang) 시 리다이렉트 루프 방지:
    // 타임아웃 경과 시 세션 사용자와 일치할 때만 캐시 적용
    const timeoutId = setTimeout(async () => {
      if (cancelled) return;
      const cached = getCachedProfile();
      if (!cached) {
        applyLoading(false);
        return;
      }
      try {
        const { data: { user: currentUser } } = await getSupabase().auth.getUser();
        if (currentUser && cached.id === currentUser.id) applyUser(cached);
      } catch {
        // 사용자 조회 실패 시 캐시 미적용
      }
      applyLoading(false);
    }, AUTH_INIT_TIMEOUT_MS);

    initAuth().finally(() => clearTimeout(timeoutId));

    if (!isSupabaseConfigured()) {
      return () => { cancelled = true; };
    }

    const supabase = getSupabase();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, s) => {
        if (cancelled) return;
        setSession(s);

        if (s) {
          await loadUserProfile(s.user.id, applyUser);
        } else {
          applyUser(null);
          setCachedProfile(null);
        }

        if (event === 'SIGNED_OUT') {
          router.push('/login');
        }
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, [router, loadUserProfile]);

  // 로그인
  const signIn = async (email: string, password: string) => {
    try {
      const supabase = getSupabase();
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        const msg = error.message;
        if (/Email not confirmed/i.test(msg)) {
          return { error: '가입은 완료되었지만 이메일 인증이 필요합니다. 메일함을 확인해 주세요!' };
        }
        if (/Invalid login credentials|invalid_grant/i.test(msg)) {
          return { error: '이메일 또는 비밀번호가 올바르지 않습니다. 다시 확인해 주세요.' };
        }
        return { error: msg };
      }

      // 회원가입 직후 DB 반영 지연 대비: 최대 2회 재시도 (500ms 간격)
      let userData: { role: string } | null = null;
      let userError: Error | null = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await supabase
          .from('users')
          .select('role')
          .eq('id', data.user.id)
          .single();
        userData = result.data;
        userError = result.error;
        if (!userError && userData) break;
        if (attempt < 2) await new Promise((r) => setTimeout(r, 500));
      }

      if (userError || !userData) {
        await supabase.auth.signOut();
        console.error('[auth] users 조회 실패:', userError?.message ?? 'no data');
        return { error: '사용자 정보를 찾을 수 없습니다. 잠시 후 다시 로그인해 주세요.' };
      }

      const redirectPath = ROLE_REDIRECT_PATH[userData.role];
      if (redirectPath) {
        window.location.href = redirectPath;
        return {};
      }

      await supabase.auth.signOut();
      return { error: '접근 권한이 없습니다.' };
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
        return { error: '네트워크 연결을 확인해 주세요. 서버에 연결할 수 없습니다.' };
      }
      return { error: msg || '로그인 중 오류가 발생했습니다.' };
    }
  };

  // OAuth 로그인 공통 (카카오/구글/애플)
  // role: 회원가입 모드 — partner(제휴업체), realtor(공인중개사), partner_apply(협력업체 신청)
  const signInWithOAuthProvider = async (
    provider: 'kakao' | 'google' | 'apple',
    role?: 'partner' | 'realtor' | 'partner_apply'
  ) => {
    try {
      const supabase = getSupabase();
      let redirectTo = getAuthCallbackUrl() || `${ADMIN_CALLBACK_BASE}/auth/callback`;
      if (role) {
        const sep = redirectTo.includes('?') ? '&' : '?';
        redirectTo = `${redirectTo}${sep}kakao_signup_role=${role}`;
      }
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });
      if (error) return { error: error.message };
      if (data?.url && typeof window !== 'undefined') {
        window.location.href = data.url;
        return {};
      }
      return {};
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/failed to fetch|networkerror|network request failed|load failed/i.test(msg)) {
        return { error: '네트워크 연결을 확인해 주세요. 서버에 연결할 수 없습니다.' };
      }
      return { error: msg || `${provider} 로그인 실패` };
    }
  };

  const signInWithKakao = (role?: 'partner' | 'realtor' | 'partner_apply') =>
    signInWithOAuthProvider('kakao', role);

  // 로그아웃
  const signOut = async () => {
    setCachedProfile(null);
    setUser(null);
    setSession(null);
    try {
      if (isSupabaseConfigured()) await getSupabase().auth.signOut();
    } catch (e) {
      console.warn('[auth] signOut Supabase 오류:', e);
    }
    // router.push만으로 리다이렉트가 안 될 수 있어 window.location으로 확실히 이동
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    } else {
      router.push('/login');
    }
  };

  // 로그인 페이지가 아닌 곳에서 미인증 상태 → 로그인 페이지로 리다이렉트
  // 제휴업체/공인중개사는 /partner/* 에서 자체 레이아웃으로 인증 처리하므로 리다이렉트 제외
  // 회원가입 페이지(/members/partners/signup, /members/realtors/signup)는 비로그인 접근 허용
  useEffect(() => {
    const p = pathname ?? '';
    if (loading || user) return;
    if (!p) return; // pathname 미확정 시 리다이렉트 보류 (회원가입 페이지 등 접근 허용)
    if (p.startsWith('/auth') || p === '/login' || p.startsWith('/partner')) return;
    if (isPublicSignupPath(p)) return;
    router.push('/login');
  }, [loading, user, pathname, router]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signInWithKakao, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
