/**
 * users 테이블 status 업데이트 공통 로직
 * - admin/users/[id], admin/partners/[id] 등에서 재사용
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type UserStatus = 'active' | 'inactive' | 'suspended' | 'terminated';

/** Admin users/partners 상태 변경 시 허용되는 값 (active, suspended, terminated) */
const ALLOWED_STATUSES: UserStatus[] = ['active', 'suspended', 'terminated'];

export function isValidUserStatus(value: unknown): value is UserStatus {
  return typeof value === 'string' && ALLOWED_STATUSES.includes(value as UserStatus);
}

export interface UpdateUserStatusResult {
  success: boolean;
  error?: string;
}

/**
 * users 테이블의 status를 변경합니다.
 * @param supabase - Supabase 클라이언트 (createServerClient 등)
 * @param userId - users.id (PK)
 * @param status - 변경할 상태
 */
export async function updateUserStatus(
  supabase: SupabaseClient,
  userId: string,
  status: UserStatus
): Promise<UpdateUserStatusResult> {
  const { error } = await supabase
    .from('users')
    .update({ status })
    .eq('id', userId);

  if (error) {
    console.error('[user-service] updateUserStatus failed:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}
