import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabase } from '../supabase';
import { sanitizeSearchQuery } from '@/lib/sanitize';
import type { ServiceCategory } from '@/types/database';

/** 서버(API 라우트)에서 사용 — 전달받은 client로 고객 목록 조회 (RLS 우회) */
export async function getCustomersWithClient(
  supabase: SupabaseClient,
  params?: {
    search?: string;
    page?: number;
    limit?: number;
    category?: ServiceCategory;
    source_type?: string;
  }
) {
  const { search, page = 1, limit = 20, category, source_type } = params || {};

  let query = supabase
    .from('customers')
    .select(`
      *,
      source_realtor:realtors!customers_source_realtor_id_fkey (id, business_name),
      service_requests (id, category)
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search?.trim()) {
    const t = sanitizeSearchQuery(search);
    if (t) {
      query = query.or(`name.ilike.%${t}%,phone.ilike.%${t}%,moving_address.ilike.%${t}%,current_address.ilike.%${t}%`);
    }
  }
  if (source_type) {
    query = query.eq('source_type', source_type);
  }

  if (!category) {
    query = query.range((page - 1) * limit, page * limit - 1);
  } else {
    query = query.range(0, 9999);
  }

  const { data, error, count } = await query;

  if (error) throw error;

  let list = data || [];
  if (category) {
    list = list.filter((c: any) =>
      (c.service_requests || []).some((r: any) => r.category === category)
    );
  }

  const total = category ? list.length : (count ?? 0);
  const paginatedList = category ? list.slice((page - 1) * limit, page * limit) : list;

  return {
    data: paginatedList,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/** 클라이언트용 — getSupabase()로 고객 목록 조회 (RLS 적용) */
export async function getCustomers(params?: Parameters<typeof getCustomersWithClient>[1]) {
  return getCustomersWithClient(getSupabase(), params);
}

/** 서버(API 라우트)에서 사용 — 전달받은 client로 고객 통계 조회 (RLS 우회) */
export async function getCustomerStatsWithClient(supabase: SupabaseClient): Promise<{
  total: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  const { data: list, error } = await supabase
    .from('customers')
    .select('id, source_type, service_requests ( category )')
    .order('created_at', { ascending: false });

  if (error) throw error;

  const bySource: Record<string, number> = {};
  const byCategory: Record<string, number> = {};
  let total = 0;

  for (const row of list ?? []) {
    total += 1;
    const src = row.source_type ?? 'direct';
    bySource[src] = (bySource[src] ?? 0) + 1;
    const reqs = row.service_requests ?? [];
    for (const r of reqs) {
      const cat = r?.category ?? 'moving';
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
    }
  }

  return { total, bySource, byCategory };
}

/** 리드관리 고객 통계 — 유입처별·서비스별 집계 (클라이언트, RLS 적용) */
export async function getCustomerStats(): Promise<{
  total: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
}> {
  return getCustomerStatsWithClient(getSupabase());
}
