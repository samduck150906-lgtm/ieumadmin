import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseOrServer } from '../supabase';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import { Partner, User, ServiceCategory } from '@/types/database';

/** 제휴업체 목록 정렬 옵션 */
export type PartnerListSort = 'created_at' | 'rating_asc' | 'complaint_desc' | 'assignment_desc';

const ASSIGNMENT_SORT_CAP = 2000; // 배정순 정렬 시 메모리 정렬 대상 상한

// 제휴업체 목록 조회
export async function getPartners(params?: {
  search?: string;
  category?: ServiceCategory;
  status?: string;
  page?: number;
  limit?: number;
  sort?: PartnerListSort;
}) {
  const supabase = getSupabaseOrServer();
  const { search, category, status, page = 1, limit = 20, sort = 'created_at' } = params || {};

  // 상태 필터: PostgREST는 조인된 테이블 컬럼을 .eq()로 직접 필터할 수 없으므로
  // users 테이블에서 해당 status의 user_id 목록을 먼저 조회
  let filteredUserIds: string[] | undefined;
  if (status) {
    const { data: userRows } = await supabase
      .from('users')
      .select('id')
      .eq('status', status)
      .eq('role', 'partner');
    filteredUserIds = (userRows || []).map((u: { id: string }) => u.id);
    if (filteredUserIds.length === 0) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  const baseSelect = `
    *,
    user:users!partners_user_id_fkey (
      id, email, phone, name, status, created_at
    )
  `;

  // 배정순: 필터 매칭 파트너를 많이 가져온 뒤 배정 건수로 정렬·페이지 슬라이스
  if (sort === 'assignment_desc') {
    let countQuery = supabase
      .from('partners')
      .select('id', { count: 'exact', head: true });
    if (search) {
      const sanitized = sanitizeSearchQuery(search);
      if (sanitized) countQuery = countQuery.or(`business_name.ilike.%${sanitized}%,manager_name.ilike.%${sanitized}%,manager_phone.ilike.%${sanitized}%`);
    }
    if (category) countQuery = countQuery.contains('service_categories', [category]);
    if (filteredUserIds) countQuery = countQuery.in('user_id', filteredUserIds);
    const { count: totalCount } = await countQuery.range(0, 0);
    const total = totalCount ?? 0;

    let dataQuery = supabase
      .from('partners')
      .select(baseSelect, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(0, ASSIGNMENT_SORT_CAP - 1);
    if (search) {
      const sanitized = sanitizeSearchQuery(search);
      if (sanitized) dataQuery = dataQuery.or(`business_name.ilike.%${sanitized}%,manager_name.ilike.%${sanitized}%,manager_phone.ilike.%${sanitized}%`);
    }
    if (category) dataQuery = dataQuery.contains('service_categories', [category]);
    if (filteredUserIds) dataQuery = dataQuery.in('user_id', filteredUserIds);
    const { data: allRows, error: dataError } = await dataQuery;
    if (dataError) throw dataError;
    const list = (allRows || []) as (Partner & { user: User })[];

    const partnerIds = list.map((p) => p.id);
    if (partnerIds.length === 0) {
      return { data: [], total, page, limit, totalPages: Math.ceil(total / limit) };
    }
    const { data: paRows } = await supabase
      .from('partner_assignments')
      .select('partner_id')
      .in('partner_id', partnerIds);
    const countByPartner = new Map<string, number>();
    (paRows || []).forEach((r: { partner_id: string }) => {
      countByPartner.set(r.partner_id, (countByPartner.get(r.partner_id) ?? 0) + 1);
    });
    list.sort((a, b) => (countByPartner.get(b.id) ?? 0) - (countByPartner.get(a.id) ?? 0));
    const from = (page - 1) * limit;
    const to = from + limit;
    const data = list.slice(from, to);
    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  let query = supabase
    .from('partners')
    .select(baseSelect, { count: 'exact' });

  // 정렬
  if (sort === 'rating_asc') {
    query = query.order('avg_rating', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false });
  } else if (sort === 'complaint_desc') {
    query = query.order('complaint_count', { ascending: false, nullsFirst: false }).order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  // 검색
  if (search) {
    const sanitized = sanitizeSearchQuery(search);
    if (sanitized) {
      query = query.or(`business_name.ilike.%${sanitized}%,manager_name.ilike.%${sanitized}%,manager_phone.ilike.%${sanitized}%`);
    }
  }

  // 업종 필터
  if (category) {
    query = query.contains('service_categories', [category]);
  }

  // 상태 필터 (user_id 목록으로 필터링)
  if (filteredUserIds) {
    query = query.in('user_id', filteredUserIds);
  }

  // 페이지네이션
  const from = (page - 1) * limit;
  const to = from + limit - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;

  if (error) throw error;

  return {
    data: data as (Partner & { user: User })[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

// 제휴업체 상세 조회
export async function getPartnerById(id: string) {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('partners')
    .select(`
      *,
      user:users!partners_user_id_fkey (*)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// 카테고리별 제휴업체 목록 (배정용) — 활성 업체만 반환
// supabaseClient: Netlify 함수 등 서버 컨텍스트에서 전달 (미전달 시 getSupabase 사용)
export async function getPartnersByCategory(category: ServiceCategory, supabaseClient?: SupabaseClient) {
  const supabase = supabaseClient ?? getSupabaseOrServer();

  // 활성 파트너 user_id 목록 조회 (PostgREST는 조인 컬럼 직접 필터 불가)
  const { data: activeUsers } = await supabase
    .from('users')
    .select('id')
    .eq('status', 'active')
    .eq('role', 'partner');
  const activeUserIds = (activeUsers || []).map((u: { id: string }) => u.id);
  if (activeUserIds.length === 0) return [];

  const { data, error } = await supabase
    .from('partners')
    .select(`
      id,
      business_name,
      manager_name,
      manager_phone,
      avg_rating,
      total_reviews,
      user_id
    `)
    .contains('service_categories', [category])
    .in('user_id', activeUserIds)
    .order('avg_rating', { ascending: false });

  if (error) throw error;
  return data;
}

// 제휴업체 상태 변경
export async function updatePartnerStatus(userId: string, status: 'active' | 'inactive' | 'suspended' | 'terminated') {
  const supabase = getSupabaseOrServer();
  const { error } = await supabase
    .from('users')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) throw error;
}

// 제휴업체 통계
export async function getPartnerStats() {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('partners')
    .select('id, avg_rating, user:users!partners_user_id_fkey(status)', { count: 'exact' });

  if (error) throw error;

  const total = data?.length || 0;
  const active = data?.filter((p: any) => p.user?.status === 'active').length || 0;
  const avgRating = data && data.length > 0
    ? data.reduce((sum, p) => sum + (p.avg_rating || 0), 0) / data.length
    : 0;

  return { total, active, avgRating: avgRating.toFixed(1) };
}

// 랜덤 배정 (해당 카테고리 업체 중 랜덤). excludePartnerIds: 제외할 partner id 목록(재배정 시 직전 업체 제외용)
// supabaseClient: Netlify 함수 등 서버 컨텍스트에서 전달
export async function getRandomPartner(
  category: ServiceCategory,
  excludePartnerIds?: string[],
  supabaseClient?: SupabaseClient
) {
  let partners = await getPartnersByCategory(category, supabaseClient);
  if (!partners || partners.length === 0) return null;

  if (excludePartnerIds?.length) {
    const excludeSet = new Set(excludePartnerIds);
    partners = partners.filter((p) => !excludeSet.has(p.id));
  }
  if (partners.length === 0) return null;

  // 평점 가중치 적용 랜덤 (평점 높을수록 선택 확률 높음)
  const totalWeight = partners.reduce((sum, p) => sum + (p.avg_rating || 3), 0);
  let random = Math.random() * totalWeight;

  for (const partner of partners) {
    random -= (partner.avg_rating || 3);
    if (random <= 0) return partner;
  }

  return partners[0];
}
