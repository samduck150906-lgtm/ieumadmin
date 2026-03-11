/**
 * admin-web Runtime Safety Layer
 * - safeFetch: try/catch, 500/401/403 별도 처리
 * - runWithFallback: 비동기 래퍼 + fallback 콜백
 * - withPendingLock, withDebounce 재내보내기
 */
import {
  safeFetch as sharedSafeFetch,
  ApiError,
  type SafeFetchResult,
  formatSupabaseError,
  withPendingLock,
  withDebounce,
  createDebouncedFn,
  createPendingLock,
  withExponentialBackoff,
  safeFetchWithRetry,
  createRetryQueue,
  isRetryableError,
  type RetryOptions,
  type RetryQueue,
} from '@/lib/shared-local';

export {
  ApiError,
  formatSupabaseError,
  withPendingLock,
  withDebounce,
  createDebouncedFn,
  createPendingLock,
  withExponentialBackoff,
  safeFetchWithRetry,
  createRetryQueue,
  isRetryableError,
};
export type { RetryOptions, RetryQueue };
export type { SafeFetchResult };

/**
 * 안전한 fetch (공통 래퍼)
 */
export const safeFetch = sharedSafeFetch;

/**
 * runWithFallback — 비동기 함수 실행 후 실패 시 fallback 호출
 * 사용 예:
 *   const result = await runWithFallback(
 *     () => getDashboardStats(),
 *     (err) => { setLoadError(getErrorMessage(err)); setStats(fallbackStats); }
 *   );
 */
export async function runWithFallback<T>(
  fn: () => Promise<T>,
  onError: (error: unknown) => void
): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    onError(err);
    return null;
  }
}

/**
 * 상태 변경 API용 — server confirm 후에만 onSuccess 호출 (optimistic update 금지)
 * 사용 예:
 *   await runMutation(
 *     () => api.updateStatus(id, status),
 *     () => { loadData(); showSuccess('변경되었습니다.'); },
 *     (err) => showError(getErrorMessage(err))
 *   );
 */
export async function runMutation<T>(
  fn: () => Promise<T>,
  onSuccess: (data: T) => void,
  onError: (error: unknown) => void
): Promise<void> {
  try {
    const data = await fn();
    onSuccess(data);
  } catch (err) {
    onError(err);
  }
}
