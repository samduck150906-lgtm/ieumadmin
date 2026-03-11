/**
 * admin-web Production Safety Layer
 * - idempotency guard (DB 기반)
 * - timezone utils 재내보내기
 * - concurrency lock
 */
import {
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
  type IdempotencyGuardResult,
  type RpcTransactionResult,
} from '@/lib/shared-local';
import { createServerClient } from './supabase-server';

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
};
export type { IdempotencyGuardResult, RpcTransactionResult };

/**
 * DB 기반 idempotency check — 캐시된 응답이 있으면 반환
 * @returns 캐시 있으면 { cached: true, status, body }, 없으면 { cached: false }
 */
export async function checkIdempotencyCached(
  key: string,
  ttlHours: number = 24
): Promise<{ cached: true; status: number; body: unknown } | { cached: false }> {
  const supabase = createServerClient();
  if (!supabase) return { cached: false };
  const { data, error } = await supabase.rpc('check_idempotency', {
    p_key: key?.trim() || '',
    p_ttl_hours: ttlHours,
  });
  if (error || !data) return { cached: false };
  const res = data as { exists?: boolean; response_status?: number; response_body?: unknown };
  if (!res.exists) return { cached: false };
  return { cached: true, status: res.response_status ?? 200, body: res.response_body };
}

/**
 * DB 기반 idempotency 기록 — 성공 시 호출
 */
export async function recordIdempotencyCached(
  key: string,
  responseStatus: number,
  responseBody: unknown,
  ttlHours: number = 24,
  requestedBy?: string
): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) return;
  await supabase.rpc('record_idempotency', {
    p_key: key?.trim() || '',
    p_response_status: responseStatus,
    p_response_body: responseBody as object,
    p_ttl_hours: ttlHours,
    p_requested_by: requestedBy ?? null,
  });
}
