/**
 * @ieum/shared — Runtime Safety Layer
 * - API 호출 try/catch, 500/401/403 별도 처리
 * - 중복 요청 방지 (debounce 500ms, pending lock)
 * - Supabase RLS 에러 → 사용자 친화적 메시지 변환
 */

/** HTTP 상태별 API 에러 */
export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

/** safeFetch 결과: 성공 시 data, 실패 시 ApiError */
export type SafeFetchResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: ApiError };

/**
 * 안전한 fetch 래퍼
 * - try/catch 강제
 * - 500/401/403 별도 메시지
 * - JSON 파싱 실패 처리
 */
export async function safeFetch<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<SafeFetchResult<T>> {
  try {
    const res = await fetch(input, init);

    let data: T;
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      try {
        data = (await res.json()) as T;
      } catch {
        data = {} as T;
      }
    } else {
      const text = await res.text();
      data = (text ? { message: text } : {}) as T;
    }

    if (res.ok) {
      return { ok: true, data, status: res.status };
    }

    const errBody = data as { error?: string; message?: string };
    const msg =
      errBody?.error ||
      errBody?.message ||
      (res.status === 500 && '서버 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.') ||
      (res.status === 401 && '로그인이 필요합니다. 다시 로그인해 주세요.') ||
      (res.status === 403 && '접근 권한이 없습니다.') ||
      `요청 실패 (${res.status})`;

    return {
      ok: false,
      error: new ApiError(msg, res.status, data),
    };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : typeof e === 'string'
          ? e
          : '네트워크 연결을 확인해 주세요.';
    return {
      ok: false,
      error: new ApiError(msg, 0),
    };
  }
}

/** 500ms debounce */
const DEBOUNCE_MS = 500;

/**
 * debounce 500ms — 동일 키에 대한 연속 호출 억제
 */
export function createDebouncedFn<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string
): (...args: Parameters<T>) => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>;

  return (...args: Parameters<T>) => {
    const key = keyFn ? keyFn(...args) : 'default';
    const existing = timers.get(key);
    if (existing) clearTimeout(existing);

    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn(...args);
      }, DEBOUNCE_MS)
    );
  };
}

/** Pending lock 상태 */
export interface PendingLockState {
  pending: boolean;
  lock: <T>(fn: () => Promise<T>) => Promise<T>;
}

/**
 * pending state lock — 동시 실행 방지
 */
export function createPendingLock(): PendingLockState {
  let pending = false;

  const lock = async <T>(fn: () => Promise<T>): Promise<T> => {
    if (pending) {
      throw new Error('이전 요청이 처리 중입니다. 잠시 후 다시 시도해 주세요.');
    }
    pending = true;
    try {
      return await fn();
    } finally {
      pending = false;
    }
  };

  return {
    get pending() {
      return pending;
    },
    lock,
  };
}

/**
 * mutation용: pending lock만 적용 (Promise 반환, server confirm 후 UI 변경에 사용)
 */
export function withPendingLock<T extends (...args: any[]) => Promise<any>>(
  fn: T
): (...args: Parameters<T>) => ReturnType<T> {
  const { lock } = createPendingLock();
  return (...args: Parameters<T>) => lock(() => fn(...args)) as ReturnType<T>;
}

/**
 * read용: debounce 500ms (연속 호출 억제, 반환값 없음)
 */
export function withDebounce<T extends (...args: any[]) => any>(
  fn: T,
  keyFn?: (...args: Parameters<T>) => string
): (...args: Parameters<T>) => void {
  return createDebouncedFn(fn, keyFn) as (...args: Parameters<T>) => void;
}

// --- Retry Queue + Exponential Backoff ---

export type RetryOptions = {
  /** 기본 대기 시간 (ms) */
  baseDelayMs?: number;
  /** 최대 재시도 횟수 (0 = 재시도 없음) */
  maxRetries?: number;
  /** 최대 대기 시간 (ms) — backoff cap */
  maxDelayMs?: number;
  /** 재시도 대상 HTTP 상태 (기본: 500+ 및 0=네트워크 에러) */
  retryableStatuses?: (status: number) => boolean;
  /** Jitter 여부 (동시 재시도 분산) */
  jitter?: boolean;
};

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'retryableStatuses'>> & {
  retryableStatuses: (status: number) => boolean;
} = {
  baseDelayMs: 1000,
  maxRetries: 3,
  maxDelayMs: 30000,
  retryableStatuses: (s) => s === 0 || s >= 500,
  jitter: true,
};

function getDelayMs(attempt: number, opts: RetryOptions): number {
  const base = opts.baseDelayMs ?? DEFAULT_RETRY_OPTIONS.baseDelayMs;
  const max = opts.maxDelayMs ?? DEFAULT_RETRY_OPTIONS.maxDelayMs;
  const exponential = base * Math.pow(2, attempt);
  const capped = Math.min(exponential, max);
  if (opts.jitter ?? DEFAULT_RETRY_OPTIONS.jitter) {
    return Math.min(
      capped * (0.5 + Math.random() * 0.5),
      max
    );
  }
  return capped;
}

/** ApiError 또는 SafeFetchResult 실패 여부 확인 */
export function isRetryableError(result: { ok: false; error: ApiError }): boolean {
  const status = result.error.status;
  return status === 0 || status >= 500;
}

/**
 * exponential backoff 적용 — API 실패 시 자동 재시도
 * @param fn — 재시도할 비동기 함수
 * @param options — RetryOptions
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt >= opts.maxRetries) throw e;
      const status = e instanceof ApiError ? e.status : 0;
      if (!opts.retryableStatuses(status)) throw e;
      const delay = getDelayMs(attempt, opts);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastError;
}

/**
 * SafeFetchResult 기반 — ok: false + retryable일 때만 재시도
 */
export async function safeFetchWithRetry<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit,
  options?: RetryOptions
): Promise<SafeFetchResult<T>> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastResult: SafeFetchResult<T> = { ok: false, error: new ApiError('', 0) };
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    const result = await safeFetch<T>(input, init);
    if (result.ok) return result;
    lastResult = result;
    if (attempt >= opts.maxRetries) return result;
    if (!opts.retryableStatuses(result.error.status)) return result;
    const delay = getDelayMs(attempt, opts);
    await new Promise((r) => setTimeout(r, delay));
  }
  return lastResult;
}

/** Retry Queue 항목 */
export interface RetryQueueItem<T> {
  fn: () => Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
  attempt: number;
  key?: string;
}

/** Retry Queue — 실패한 API를 큐에 넣어 exponential backoff로 재시도 */
export interface RetryQueue<T = unknown> {
  /** 실패한 작업을 큐에 추가 */
  enqueue(fn: () => Promise<T>, key?: string): Promise<T>;
  /** 큐에 대기 중인 작업 수 */
  get size(): number;
  /** 큐 처리 중 여부 */
  get processing(): boolean;
}

/**
 * Retry Queue 생성 — exponential backoff 적용
 */
export function createRetryQueue<T = unknown>(options?: RetryOptions): RetryQueue<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const queue: RetryQueueItem<T>[] = [];
  let processing = false;

  async function processNext(): Promise<void> {
    if (processing || queue.length === 0) return;
    processing = true;
    const item = queue.shift();
    if (!item) {
      processing = false;
      return;
    }
    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if (item.attempt < opts.maxRetries && opts.retryableStatuses(status)) {
        const delay = getDelayMs(item.attempt, opts);
        await new Promise((r) => setTimeout(r, delay));
        queue.push({
          ...item,
          attempt: item.attempt + 1,
        });
      } else {
        item.reject(e);
      }
    } finally {
      processing = false;
      if (queue.length > 0) processNext();
    }
  }

  return {
    enqueue(fn: () => Promise<T>, key?: string): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        queue.push({ fn, resolve, reject, attempt: 0, key });
        processNext();
      });
    },
    get size() {
      return queue.length;
    },
    get processing() {
      return processing;
    },
  };
}

// --- Supabase RLS 에러 매핑 ---

/** PostgREST/Supabase 에러 코드 → 사용자 친화 메시지 */
const RLS_USER_MESSAGES: Record<string, string> = {
  // RLS policy violation
  PGRST301: '조회 권한이 없습니다.',
  PGRST302: '이 작업에 대한 권한이 없습니다.',
  PGRST116: '조회된 데이터가 없습니다.',
  '42501': '접근 권한이 없습니다.',
  '42P01': '요청한 데이터를 찾을 수 없습니다.',
  '23503': '관련된 다른 데이터가 있어 변경할 수 없습니다.',
  '23505': '이미 존재하는 데이터입니다.',
  '23502': '필수 정보가 누락되었습니다.',
  '22P02': '입력값 형식이 올바르지 않습니다.',
};

/** RLS policy 관련 키워드 → 사용자 메시지 */
const RLS_KEYWORDS: Array<{ pattern: RegExp; message: string }> = [
  { pattern: /violates row-level security|RLS policy/i, message: '접근 권한이 없습니다.' },
  { pattern: /permission denied/i, message: '이 작업에 대한 권한이 없습니다.' },
  { pattern: /policy/i, message: '접근 권한이 없습니다.' },
  { pattern: /forbidden/i, message: '접근이 제한되었습니다.' },
  { pattern: /new row violates check/i, message: '입력값이 조건에 맞지 않습니다.' },
  { pattern: /duplicate key/i, message: '이미 존재하는 데이터입니다.' },
  { pattern: /null value/i, message: '필수 정보가 누락되었습니다.' },
  { pattern: /foreign key/i, message: '관련된 다른 데이터가 있어 처리할 수 없습니다.' },
  { pattern: /invalid input|invalid uuid/i, message: '입력값 형식이 올바르지 않습니다.' },
];

/**
 * Supabase/PostgREST 에러를 사용자 친화적 메시지로 변환
 */
export function formatSupabaseError(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return '처리 중 오류가 발생했습니다.';
  }

  const obj = error as { message?: string; code?: string; details?: string; hint?: string };

  const raw = String(obj.message ?? obj.details ?? '');
  const code = obj.code ?? (obj as { errcode?: string }).errcode;

  // 1) 코드 기반 매핑
  if (code && RLS_USER_MESSAGES[code]) {
    return RLS_USER_MESSAGES[code];
  }

  // 2) PostgREST PGRST* 코드
  const pgrst = code?.toString()?.match(/PGRST\d+/);
  if (pgrst && RLS_USER_MESSAGES[pgrst[0]]) {
    return RLS_USER_MESSAGES[pgrst[0]];
  }

  // 3) 키워드 기반 매핑
  for (const { pattern, message } of RLS_KEYWORDS) {
    if (pattern.test(raw)) return message;
  }

  // 4) hint가 있으면 활용 (개발자용이지만 사용자에게도 유용할 수 있음)
  if (obj.hint && !/internal|debug/i.test(obj.hint)) {
    return obj.hint;
  }

  // 5) 원본 메시지가 짧고 명확하면 그대로 (한글 등)
  if (raw.length > 0 && raw.length < 80 && !/select|insert|update|delete|from|where/i.test(raw)) {
    return raw;
  }

  return '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}
