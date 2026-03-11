/**
 * 감사 로그 기록 (결제/출금 상태 변경 등)
 * - audit_logs 테이블에 INSERT (서버 전용, createServerClient 사용)
 * - 관리자 화면 > 감사 로그에서 조회 가능
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuditActorType = 'staff' | 'partner' | 'realtor' | 'system';

export interface AuditLogParams {
  actor_type: AuditActorType;
  actor_id: string | null;
  action: string;
  resource_type?: string;
  resource_id?: string;
  details?: Record<string, unknown>;
}

/**
 * audit_logs에 한 건 기록
 * 실패 시 에러 로그만 남기고 예외를 던지지 않음 (메인 비즈니스 로직 방해 방지)
 */
export async function logAudit(
  supabase: SupabaseClient,
  params: AuditLogParams
): Promise<void> {
  try {
    const { error } = await supabase.from('audit_logs').insert({
      actor_type: params.actor_type,
      actor_id: params.actor_id ?? null,
      action: params.action,
      resource_type: params.resource_type ?? null,
      resource_id: params.resource_id ?? null,
      details: params.details ?? null,
    });
    if (error) {
      console.error('[audit-log] insert failed:', error.message);
    }
  } catch (e) {
    console.error('[audit-log] error:', e);
  }
}
