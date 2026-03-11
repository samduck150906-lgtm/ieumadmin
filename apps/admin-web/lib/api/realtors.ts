import { getSupabaseOrServer } from '../supabase';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import { Realtor, User } from '@/types/database';

/** 활동 = 로그인 OR 고객 신청 발생. last_activity = MAX(last_sign_in_at, 최근 고객신청일) */
export interface InactiveRealtorItem extends Realtor {
  user?: User;
  last_activity_at: string | null;
  last_sign_in_at: string | null;
  last_customer_at: string | null;
}

/**
 * 2주(14일) 이상 미활동 공인중개사 조회
 * 활동 = 로그인(last_sign_in_at) OR 고객 신청(source_realtor_id로 유입된 customers.created_at)
 */
export async function getInactiveRealtors(params?: {
  inactiveDays?: number;
  limit?: number;
}): Promise<{ data: InactiveRealtorItem[]; total: number }> {
  const supabase = getSupabaseOrServer();
  const inactiveDays = params?.inactiveDays ?? 14;
  const limit = params?.limit ?? 500;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - inactiveDays);
  const cutoffIso = cutoff.toISOString();

  // 1. 모든 공인중개사 + user (last_sign_in_at)
  const { data: realtorRows, error: realtorErr } = await supabase
    .from('realtors')
    .select(
      `
      *,
      user:users!realtors_user_id_fkey (
        id, email, phone, name, status, created_at, last_sign_in_at, expo_push_token
      )
    `
    )
    .order('created_at', { ascending: false });

  if (realtorErr) throw realtorErr;
  const realtors = (realtorRows ?? []) as (Realtor & { user: User })[];

  if (realtors.length === 0) {
    return { data: [], total: 0 };
  }

  const realtorIds = realtors.map((r) => r.id);

  // 2. realtor별 최근 고객 신청일 (customers.source_realtor_id)
  const { data: customerAgg } = await supabase
    .from('customers')
    .select('source_realtor_id, created_at')
    .in('source_realtor_id', realtorIds)
    .not('source_realtor_id', 'is', null);

  const lastCustomerByRealtor = new Map<string, string>();
  (customerAgg ?? []).forEach((c: { source_realtor_id: string; created_at: string }) => {
    const rid = c.source_realtor_id;
    const existing = lastCustomerByRealtor.get(rid);
    if (!existing || c.created_at > existing) {
      lastCustomerByRealtor.set(rid, c.created_at);
    }
  });

  // 3. last_activity = MAX(last_sign_in_at, last_customer_at), inactive 필터
  const inactive: InactiveRealtorItem[] = [];
  for (const r of realtors) {
    const lastSignIn = r.user?.last_sign_in_at ?? null;
    const lastCustomer = lastCustomerByRealtor.get(r.id) ?? null;
    const lastActivity =
      lastSignIn && lastCustomer
        ? lastSignIn > lastCustomer
          ? lastSignIn
          : lastCustomer
        : lastSignIn ?? lastCustomer;

    if (lastActivity && lastActivity >= cutoffIso) {
      continue; // 최근 활동 있음 → 제외
    }

    inactive.push({
      ...r,
      last_activity_at: lastActivity,
      last_sign_in_at: lastSignIn,
      last_customer_at: lastCustomer,
    });
  }

  const total = inactive.length;
  const data = inactive.slice(0, limit);

  return { data, total };
}

/**
 * 미활동 중개사 user_id 목록 (getRealtors inactiveDays 필터용)
 * 활동 = 로그인 OR 고객 신청
 */
export async function getInactiveRealtorUserIds(inactiveDays: number): Promise<string[]> {
  const { data } = await getInactiveRealtors({ inactiveDays, limit: 10000 });
  return [...new Set(data.map((r) => r.user_id).filter(Boolean))];
}

// 공인중개사 목록 조회 (referrer는 self-join 이슈 회피를 위해 별도 조회 후 병합)
export async function getRealtors(params?: {
  search?: string;
  status?: string;
  verified?: boolean;
  /** true면 엑셀 미다운로드만 조회 (last_excel_downloaded_at이 null인 경우) */
  excelNotDownloaded?: boolean;
  /** 2주 이상 미활동만 조회 (last_sign_in_at이 null이거나 days일 이전) */
  inactiveDays?: number;
  page?: number;
  limit?: number;
}) {
  const supabase = getSupabaseOrServer();
  const { search, status, verified, excelNotDownloaded, inactiveDays, page = 1, limit = 20 } = params || {};

  let query = supabase
    .from('realtors')
    .select(
      `
      *,
      user:users!realtors_user_id_fkey (
        id, email, phone, name, status, created_at, last_sign_in_at, expo_push_token
      )
    `,
      { count: 'exact' }
    )
    .order('created_at', { ascending: false });

  // 2주 이상 미활동 필터 (활동 = 로그인 OR 고객 신청)
  if (inactiveDays != null && inactiveDays > 0) {
    const ids = await getInactiveRealtorUserIds(inactiveDays);
    if (ids.length > 0) {
      query = query.in('user_id', ids);
    } else {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  // 검색
  if (search) {
    const sanitized = sanitizeSearchQuery(search);
    if (sanitized) {
      query = query.or(
        `business_name.ilike.%${sanitized}%,contact_name.ilike.%${sanitized}%,contact_phone.ilike.%${sanitized}%,address.ilike.%${sanitized}%`
      );
    }
  }

  // 상태 필터
  if (status) {
    query = query.eq('user.status', status);
  }

  // 계좌인증 필터
  if (verified !== undefined) {
    query = query.eq('account_verified', verified);
  }

  // 엑셀 미다운로드만 필터
  if (excelNotDownloaded) {
    query = query.is('last_excel_downloaded_at', null);
  }

  // 페이지네이션
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) throw error;

  const rows = (data ?? []) as (Realtor & { user: User; referrer_id?: string | null })[];

  // referrer_id가 있는 경우 추천인 정보만 별도 조회 (self-join 스키마 캐시 오류 회피)
  const referrerIds = [...new Set(rows.map((r) => r.referrer_id).filter(Boolean))] as string[];
  let referrerMap: Record<string, { id: string; business_name: string; contact_name: string | null }> = {};
  if (referrerIds.length > 0) {
    const { data: referrers } = await supabase
      .from('realtors')
      .select('id, business_name, contact_name')
      .in('id', referrerIds);
    if (referrers) {
      referrerMap = Object.fromEntries(referrers.map((r) => [r.id, r]));
    }
  }

  type RealtorRow = Realtor & {
    user: User;
    referrer?: { id: string; business_name: string; contact_name: string | null } | null;
  };
  const dataWithReferrer: RealtorRow[] = rows.map((r) => ({
    ...r,
    referrer: r.referrer_id && referrerMap[r.referrer_id] ? referrerMap[r.referrer_id] : null,
  }));

  return {
    data: dataWithReferrer,
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

// 공인중개사 상세 조회 (referrer는 self-join 이슈 회피를 위해 별도 조회 후 병합)
export async function getRealtorById(id: string) {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('realtors')
    .select(
      `
      *,
      user:users!realtors_user_id_fkey (*)
    `
    )
    .eq('id', id)
    .single();

  if (error) throw error;

  const row = data as Realtor & { user: User; referrer_id?: string | null };
  let referrer: { id: string; business_name: string; contact_name: string | null } | null = null;
  if (row?.referrer_id) {
    const { data: ref } = await supabase
      .from('realtors')
      .select('id, business_name, contact_name')
      .eq('id', row.referrer_id)
      .single();
    if (ref) referrer = ref;
  }

  return { ...row, referrer };
}

// 공인중개사 상태 변경
export async function updateRealtorStatus(userId: string, status: 'active' | 'inactive' | 'suspended' | 'terminated') {
  const supabase = getSupabaseOrServer();
  const { error } = await supabase
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

// 계좌 인증 처리
export async function verifyRealtorAccount(realtorId: string, verified: boolean) {
  const supabase = getSupabaseOrServer();
  const { error } = await supabase
    .from('realtors')
    .update({ account_verified: verified, updated_at: new Date().toISOString() })
    .eq('id', realtorId);

  if (error) throw error;
}

// 공인중개사 통계
export async function getRealtorStats() {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('realtors')
    .select('id, created_at, user:users!realtors_user_id_fkey(status)', { count: 'exact' });

  if (error) throw error;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const total = data?.length || 0;
  const active = data?.filter((r: any) => r.user?.status === 'active').length || 0;
  const thisMonth = data?.filter((r: any) => r.created_at >= startOfMonth).length || 0;

  return { total, active, thisMonth };
}

// 엑셀 다운로드용 전체 데이터 (추천인 정보 포함)
export async function getRealtorsForExport(ids?: string[]) {
  const supabase = getSupabaseOrServer();
  let query = supabase
    .from('realtors')
    .select(`
      id,
      business_name,
      address,
      contact_name,
      contact_phone,
      qr_code_url,
      account_verified,
      bank_name,
      account_number,
      account_holder,
      last_excel_downloaded_at,
      created_at,
      referrer_id,
      user:users!realtors_user_id_fkey (
        email, status
      )
    `)
    .order('created_at', { ascending: false });

  if (ids && ids.length > 0) {
    query = query.in('id', ids);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data ?? []) as (Record<string, unknown> & { referrer_id?: string | null })[];
  const referrerIds = [...new Set(rows.map((r) => r.referrer_id).filter(Boolean))] as string[];
  let referrerMap: Record<string, { id: string; business_name: string; contact_name: string | null }> = {};
  if (referrerIds.length > 0) {
    const { data: referrers } = await supabase
      .from('realtors')
      .select('id, business_name, contact_name')
      .in('id', referrerIds);
    if (referrers) {
      referrerMap = Object.fromEntries(referrers.map((r) => [r.id, r]));
    }
  }

  return rows.map((r) => ({
    ...r,
    referrer: r.referrer_id && referrerMap[r.referrer_id] ? referrerMap[r.referrer_id] : null,
  }));
}

// 엑셀 다운로드 기록 (공인중개사별 최종 다운로드 일시 갱신)
export async function updateRealtorsExcelDownloaded(realtorIds: string[], userId: string) {
  if (realtorIds.length === 0) return;
  const supabase = getSupabaseOrServer();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('realtors')
    .update({
      last_excel_downloaded_at: now,
      last_excel_downloaded_by: userId,
      updated_at: now,
    })
    .in('id', realtorIds);

  if (error) throw error;
}

// 엑셀 다운로드 로그 (excel_download_logs 테이블용)
export async function logExcelDownload(userId: string, downloadType: string) {
  const supabase = getSupabaseOrServer();
  const { error } = await supabase
    .from('excel_download_logs')
    .insert({
      user_id: userId,
      download_type: downloadType,
    });

  if (error) throw error;
}
