'use client';

import type { Session } from '@supabase/supabase-js';
import { useAuth } from '@/lib/auth';

/**
 * API 호출 시 사용할 인증 헤더 생성
 * session.access_token이 있으면 Authorization Bearer 헤더 포함
 * @param session Supabase 세션 (useAuth().session)
 * @returns fetch headers에 전달할 HeadersInit
 */
export function getAuthHeaders(session: Session | null): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {}),
  };
}

/**
 * useAuth의 session을 사용하는 인증 헤더 훅
 * API 호출 시 토큰 누락 방지
 */
export function useAuthHeaders(): HeadersInit {
  const { session } = useAuth();
  return getAuthHeaders(session);
}
