/**
 * @ieum/shared re-export — admin-web에서 공통 유틸 사용
 */
export {
  utcNow,
  toUtcIso,
  utcToKstDate,
  utcToKstFormatted,
  startOfCurrentMonthUtc,
  endOfCurrentMonthUtc,
  getIdempotencyKey,
  withConcurrencyLock,
  checkOptimisticLock,
  parseRpcResult,
} from '@ieum/shared';

export type {
  IdempotencyGuardResult,
  RpcTransactionResult,
} from '@ieum/shared';

export {
  ApiError,
  safeFetch,
  formatSupabaseError,
  createDebouncedFn,
  createPendingLock,
  withPendingLock,
  withDebounce,
  withExponentialBackoff,
  safeFetchWithRetry,
  createRetryQueue,
  isRetryableError,
} from '@ieum/shared';

export type {
  SafeFetchResult,
  RetryOptions,
  RetryQueue,
} from '@ieum/shared';
