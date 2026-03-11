/**
 * @ieum/shared — Production Safety Layer
 *
 * - Transaction: RPC 기반 트랜잭션 래퍼 (Supabase는 직접 transaction 미지원 → PostgreSQL RPC 사용)
 * - Duplicate prevention: Idempotency key guard
 * - Notification dedupe: event_key 기반 원자적 처리
 * - Concurrency control: Advisory lock, optimistic locking (version)
 * - Timezone normalization: UTC 저장, 표시 시 KST 변환
 */

// ============================================
// 1. Timezone Normalization
// ============================================

/** 서버/DB 저장용 — 항상 UTC ISO 문자열 반환 */
export function utcNow(): string {
  return new Date().toISOString();
}

/** Date → UTC ISO (저장용). 이미 UTC면 그대로. */
export function toUtcIso(d: Date | string | number): string {
  if (typeof d === 'string') return new Date(d).toISOString();
  if (typeof d === 'number') return new Date(d).toISOString();
  return d.toISOString();
}

/** UTC ISO → KST YYYY-MM-DD (표시용) */
export function utcToKstDate(utcIso: string): string {
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}

/** UTC ISO → KST 포맷 (YYYY-MM-DD HH:mm, 표시용) */
export function utcToKstFormatted(utcIso: string): string {
  const d = new Date(utcIso);
  const kst = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = kst.getUTCFullYear();
  const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
  const day = String(kst.getUTCDate()).padStart(2, '0');
  const h = String(kst.getUTCHours()).padStart(2, '0');
  const min = String(kst.getUTCMinutes()).padStart(2, '0');
  return `${y}-${m}-${day} ${h}:${min}`;
}

/** 현재 월의 시작(UTC) YYYY-MM-DD — DB 쿼리용 */
export function startOfCurrentMonthUtc(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

/** 현재 월의 끝(UTC) YYYY-MM-DD — DB 쿼리용 */
export function endOfCurrentMonthUtc(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

// ============================================
// 2. Duplicate Prevention (Idempotency Guard)
// ============================================

export type IdempotencyGuardResult<T> =
  | { ok: true; data: T; fromCache?: boolean }
  | { ok: false; error: string };

/**
 * Idempotency guard — 동일 키로 중복 실행 방지
 * 클라이언트: X-Idempotency-Key 헤더로 키 전달
 * 서버: DB(idempotency_keys) 또는 메모리(Map)로 확인
 *
 * DB 백엔드 사용 시: withIdempotencyGuard(supabase, key, ttlMs, fn)
 * 메모리 백엔드: 단일 인스턴스 또는 단기 TTL용
 */
const idempotencyCache = new Map<
  string,
  { result: unknown; expiresAt: number }
>();

const DEFAULT_IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

/**
 * 메모리 기반 idempotency guard — 단일 인스턴스 또는 dev 환경용
 * Production 다중 인스턴스에서는 DB 기반 RPC 사용 권장
 */
export async function withIdempotencyGuard<T>(
  key: string,
  fn: () => Promise<T>,
  ttlMs: number = DEFAULT_IDEMPOTENCY_TTL_MS
): Promise<IdempotencyGuardResult<T>> {
  const now = Date.now();
  const cached = idempotencyCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { ok: true, data: cached.result as T, fromCache: true };
  }
  idempotencyCache.set(key, {
    result: null,
    expiresAt: now + ttlMs,
  });
  try {
    const result = await fn();
    idempotencyCache.set(key, { result, expiresAt: now + ttlMs });
    return { ok: true, data: result };
  } catch (err) {
    idempotencyCache.delete(key);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** 요청에서 Idempotency-Key 헤더 추출 */
export function getIdempotencyKey(request: Request): string | null {
  return request.headers.get('Idempotency-Key') ?? request.headers.get('X-Idempotency-Key');
}

// ============================================
// 3. Concurrency Control
// ============================================

/** Optimistic locking — updated_at/version 기반 동시 수정 방지 */
export function checkOptimisticLock(
  currentUpdatedAt: string | null,
  incomingUpdatedAt: string | null
): boolean {
  if (!currentUpdatedAt || !incomingUpdatedAt) return true;
  return currentUpdatedAt === incomingUpdatedAt;
}

/** 동시 실행 방지 — 단일 플로우 lock (withPendingLock과 유사, 커스텀 키 지원) */
const concurrencyLocks = new Map<string, Promise<unknown>>();

export async function withConcurrencyLock<T>(
  lockKey: string,
  fn: () => Promise<T>
): Promise<T> {
  const existing = concurrencyLocks.get(lockKey);
  if (existing) {
    await existing;
  }
  const p = fn().finally(() => {
    concurrencyLocks.delete(lockKey);
  });
  concurrencyLocks.set(lockKey, p);
  return p;
}

// ============================================
// 4. Transaction Wrapper (RPC 기반)
// ============================================

/**
 * Supabase RPC 호출 래퍼 — 트랜잭션 로직은 PostgreSQL 함수 내부에서 처리
 * 클라이언트는 이 래퍼로 RPC 호출 후 성공/에러 일관 처리
 */
export type RpcTransactionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export function parseRpcResult<T = unknown>(raw: { data?: unknown; error?: unknown }): RpcTransactionResult<T> {
  const data = raw.data as { success?: boolean; error?: string } | null;
  if (!data) {
    return { success: false, error: '응답 형식이 올바르지 않습니다.' };
  }
  if (data.success === false && data.error) {
    return { success: false, error: data.error };
  }
  return { success: true, data: raw.data as T };
}
