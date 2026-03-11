/**
 * API Axios 인스턴스 — 토큰 주입, 에러 처리, 토스트
 * 클라이언트 전용. 토큰 우선순위: localStorage admin_token → Supabase 세션 access_token
 * (관리자웹은 Supabase 쿠키 기반 로그인만 사용하므로 세션 Bearer 전달이 필수)
 */

import axios, {
  type AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { getSupabase } from '@/lib/supabase';

const API_BASE_URL =
  (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_API_URL) ||
  (typeof window !== 'undefined' ? '' : 'http://localhost:3000');

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('admin_token');
}

function showErrorToast(message: string): void {
  if (typeof window === 'undefined') return;
  import('@/lib/toast').then(({ showError }) => showError(message));
}

api.interceptors.request.use(
  async (config: InternalAxiosRequestConfig) => {
    let token = getStoredToken();
    if (!token && typeof window !== 'undefined') {
      try {
        const { data: { session } } = await getSupabase().auth.getSession();
        token = session?.access_token ?? null;
      } catch {
        // Supabase 미설정 등
      }
    }
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error: AxiosError) => Promise.reject(error)
);

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // 401은 에러로 그대로 전파 (React Query/컴포넌트에서 에러 UI 처리)
      // window.location 리다이렉트 제거 — Supabase 쿠키 기반 인증이므로 별도 refresh 불필요
      return Promise.reject(error);
    }

    const errorMessages: Record<number, string> = {
      400: '잘못된 요청입니다.',
      403: '접근 권한이 없습니다.',
      404: '요청한 데이터를 찾을 수 없습니다.',
      409: '이미 처리된 요청입니다.',
      422: '입력 데이터를 확인해주세요.',
      429: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      500: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    };
    const status = error.response?.status ?? 0;
    const message = errorMessages[status] ?? '알 수 없는 오류가 발생했습니다.';
    showErrorToast(message);

    return Promise.reject(error);
  }
);

export default api;
