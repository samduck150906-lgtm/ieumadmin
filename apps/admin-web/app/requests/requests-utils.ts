import type { RequestRow, CustomerRow } from './requests-types';

/** Supabase가 관계 1건일 때 객체로 반환할 수 있으므로 항상 배열로 정규화 */
export function normalizeServiceRequests(sr: unknown): RequestRow[] {
  if (Array.isArray(sr)) return sr as RequestRow[];
  if (sr && typeof sr === 'object' && 'id' in (sr as object)) return [sr as RequestRow];
  return [];
}

/** 고객 목록에서 서비스 요청 ID 목록 추출 (전체 선택/현재 페이지 선택 공용) */
export function getRequestIdsFromCustomers(customers: CustomerRow[]): string[] {
  return customers.flatMap((c) => normalizeServiceRequests(c.service_requests).map((r) => r.id));
}
