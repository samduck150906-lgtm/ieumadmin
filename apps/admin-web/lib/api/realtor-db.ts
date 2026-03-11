/**
 * 공인중개사 앱 DB 마켓 API — 미배정 서비스 요청 목록/상세/구매
 * marketplace_db(미배정 DB) + db_price_* 열람가 → 앱 DbMarketItem 형식
 */
import { createServerClient } from '../supabase';
import { getDbViewPrice } from './partner-db';
import type { ServiceCategory } from '@/types/database';

/** 앱 DbMarketItem과 호환되는 목록/상세 응답 타입 */
export interface RealtorDbMarketItem {
  id: string;
  category: string;
  rawAddress: string;
  regionLabel: string;
  areaPyeong?: number | null;
  areaSquareMeters?: number | null;
  productLabel: string;
  serviceDate: string;
  price: number;
  isUrgent: boolean;
  createdAt: string;
}

const AREA_TO_PYEONG: Record<string, number> = {
  under_10: 10,
  under_20: 15,
  under_30: 25,
  over_30: 30,
  under_12: 10,
  between_12_20: 15,
  over_20: 25,
};

const CATEGORY_PRODUCT_LABEL: Record<string, string> = {
  moving: '일반 이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  kiosk: '키오스크',
};

const MOVING_TYPE_LABEL: Record<string, string> = {
  general: '일반 이사',
  full_pack: '포장이사',
  half_pack: '반포장이사',
};

function toRegionLabel(level1?: string | null, level2?: string | null, address?: string | null): string {
  if (level1 && level2) return `${level1} ${level2}`.trim();
  if (level1) return level1;
  if (address) {
    const m = address.match(/(서울|경기|인천|부산|대구|대전|광주|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)/);
    if (m) return m[1];
  }
  return '지역미정';
}

function toProductLabel(category: string, movingType?: string | null, requestedProduct?: string | null): string {
  if (requestedProduct?.trim()) return requestedProduct.trim();
  if (category === 'moving' && movingType) return MOVING_TYPE_LABEL[movingType] ?? '일반 이사';
  return CATEGORY_PRODUCT_LABEL[category] ?? category;
}

function toServiceDate(preferredDate?: string | null, movingDate?: string | null): string {
  if (preferredDate) return preferredDate;
  if (movingDate) return movingDate;
  return new Date().toISOString().slice(0, 10);
}

function isUrgent(serviceDate: string, withinDays = 3): boolean {
  const d = new Date(serviceDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= withinDays;
}

/** 공인중개사 DB 마켓 목록 (미배정 서비스 요청, 필터/정렬/페이지) */
export async function getRealtorDbMarketList(
  _realtorId: string,
  params: {
    category?: string | null;
    regions?: string[];
    areaMinPyeong?: number | null;
    areaMaxPyeong?: number | null;
    dateFrom?: string | null;
    dateTo?: string | null;
    sort?: string;
    limit?: number;
    cursor?: string | null;
  } = {}
): Promise<{ data: RealtorDbMarketItem[]; nextCursor: string | null; hasMore: boolean }> {
  const supabase = createServerClient();
  if (!supabase) throw new Error('서버 Supabase 미설정');

  const limit = Math.min(params.limit ?? 20, 50);
  let query = supabase
    .from('service_requests')
    .select(
      `
      id, category, created_at, preferred_date, requested_product,
      customer:customers!service_requests_customer_id_fkey (
        current_address, moving_address, moving_date, area_size, moving_type,
        region_level1, region_level2
      )
    `,
      { count: 'exact' }
    )
    .is('assigned_partner_id', null)
    .in('hq_status', ['unread', 'read', 'assigned', 'settlement_check', 'hq_review_needed']);

  if (params.category) query = query.eq('category', params.category);
  if (params.dateFrom) query = query.gte('preferred_date', params.dateFrom);
  if (params.dateTo) query = query.lte('preferred_date', params.dateTo);

  const sort = params.sort ?? 'urgent_first';
  if (sort === 'service_date_asc') query = query.order('preferred_date', { ascending: true, nullsFirst: false });
  else if (sort === 'service_date_desc') query = query.order('preferred_date', { ascending: false, nullsFirst: true });
  else query = query.order('created_at', { ascending: false });

  query = query.range(0, limit - 1);
  const { data: rows, error, count } = await query;
  if (error) throw new Error(error.message);

  const items: RealtorDbMarketItem[] = [];
  for (const row of rows ?? []) {
    const customer: unknown = Array.isArray((row as { customer?: unknown }).customer)
      ? (row as { customer: unknown[] }).customer[0]
      : (row as { customer?: unknown }).customer;
    const c = customer as {
      current_address?: string | null;
      moving_address?: string | null;
      moving_date?: string | null;
      area_size?: string | null;
      moving_type?: string | null;
      region_level1?: string | null;
      region_level2?: string | null;
    } | undefined;
    const rawAddress = (c?.moving_address ?? c?.current_address ?? '').toString() || '주소 없음';
    const serviceDate = toServiceDate(
      (row as { preferred_date?: string | null }).preferred_date,
      c?.moving_date as string | null
    );
    const price = await getDbViewPrice(row.category as ServiceCategory, c);
    const areaPyeong = c?.area_size ? AREA_TO_PYEONG[c.area_size] ?? null : null;
    items.push({
      id: row.id,
      category: row.category,
      rawAddress,
      regionLabel: toRegionLabel(c?.region_level1, c?.region_level2, rawAddress),
      areaPyeong: areaPyeong ?? null,
      areaSquareMeters: areaPyeong != null ? Math.round(areaPyeong * 3.3058) : null,
      productLabel: toProductLabel(row.category, c?.moving_type as string | null, (row as { requested_product?: string }).requested_product),
      serviceDate,
      price: Number(price) || 0,
      isUrgent: isUrgent(serviceDate),
      createdAt: row.created_at,
    });
  }

  let filtered = items;
  if (params.regions?.length) {
    filtered = filtered.filter((i) =>
      params.regions!.some((r) => i.regionLabel.includes(r) || i.rawAddress.includes(r))
    );
  }
  if (params.areaMinPyeong != null) {
    filtered = filtered.filter((i) => (i.areaPyeong ?? 0) >= params.areaMinPyeong!);
  }
  if (params.areaMaxPyeong != null) {
    filtered = filtered.filter((i) => (i.areaPyeong ?? 999) <= params.areaMaxPyeong!);
  }

  if (sort === 'urgent_first') {
    filtered.sort((a, b) => (a.isUrgent === b.isUrgent ? 0 : a.isUrgent ? -1 : 1));
  }

  const nextCursor = (count ?? 0) > limit ? (filtered[limit - 1]?.id ?? null) : null;
  return {
    data: filtered.slice(0, limit),
    nextCursor,
    hasMore: Boolean(nextCursor),
  };
}

/** 공인중개사 DB 마켓 상세 1건 (구매 여부에 따라 마스킹) */
export async function getRealtorDbMarketDetail(
  realtorId: string,
  id: string
): Promise<RealtorDbMarketItem | null> {
  const supabase = createServerClient();
  if (!supabase) throw new Error('서버 Supabase 미설정');

  const { data: row, error } = await supabase
    .from('service_requests')
    .select(
      `
      id, category, created_at, preferred_date, requested_product,
      customer:customers!service_requests_customer_id_fkey (
        current_address, moving_address, moving_date, area_size, moving_type,
        region_level1, region_level2
      )
    `
    )
    .eq('id', id)
    .is('assigned_partner_id', null)
    .in('hq_status', ['unread', 'read', 'assigned', 'settlement_check', 'hq_review_needed'])
    .maybeSingle();

  if (error || !row) return null;

  const customer: unknown = Array.isArray((row as { customer?: unknown }).customer)
    ? (row as { customer: unknown[] }).customer[0]
    : (row as { customer?: unknown }).customer;
  const c = customer as {
    current_address?: string | null;
    moving_address?: string | null;
    moving_date?: string | null;
    area_size?: string | null;
    moving_type?: string | null;
    region_level1?: string | null;
    region_level2?: string | null;
  } | undefined;
  const rawAddress = (c?.moving_address ?? c?.current_address ?? '').toString() || '주소 없음';
  const serviceDate = toServiceDate(
    (row as { preferred_date?: string | null }).preferred_date,
    c?.moving_date as string | null
  );
  const price = await getDbViewPrice(row.category as ServiceCategory, c);
  const areaPyeong = c?.area_size ? AREA_TO_PYEONG[c.area_size] ?? null : null;

  return {
    id: row.id,
    category: row.category,
    rawAddress,
    regionLabel: toRegionLabel(c?.region_level1, c?.region_level2, rawAddress),
    areaPyeong: areaPyeong ?? null,
    areaSquareMeters: areaPyeong != null ? Math.round(areaPyeong * 3.3058) : null,
    productLabel: toProductLabel(row.category, c?.moving_type as string | null, row.requested_product),
    serviceDate,
    price: Number(price) || 0,
    isUrgent: isUrgent(serviceDate),
    createdAt: row.created_at,
  };
}

/** 구매 후 고객 연락처 반환 가능 여부 및 연락처 */
export async function getRealtorPurchasedCustomerPhone(
  realtorId: string,
  serviceRequestId: string
): Promise<string | null> {
  const supabase = createServerClient();
  if (!supabase) return null;
  const { data: purchase } = await supabase
    .from('realtor_db_purchases')
    .select('id')
    .eq('realtor_id', realtorId)
    .eq('service_request_id', serviceRequestId)
    .maybeSingle();
  if (!purchase) return null;
  const { data: cust } = await supabase
    .from('service_requests')
    .select('customer_id')
    .eq('id', serviceRequestId)
    .single();
  if (!cust?.customer_id) return null;
  const { data: customer } = await supabase
    .from('customers')
    .select('phone')
    .eq('id', cust.customer_id)
    .single();
  return customer?.phone ?? null;
}

/** 공인중개사 DB 구매 처리 (기록 저장 후 연락처 반환) */
export async function purchaseRealtorDb(
  realtorId: string,
  serviceRequestId: string
): Promise<{ success: boolean; customerPhone?: string }> {
  const supabase = createServerClient();
  if (!supabase) throw new Error('서버 Supabase 미설정');

  const { data: existing } = await supabase
    .from('realtor_db_purchases')
    .select('id')
    .eq('realtor_id', realtorId)
    .eq('service_request_id', serviceRequestId)
    .maybeSingle();
  if (existing) {
    const phone = await getRealtorPurchasedCustomerPhone(realtorId, serviceRequestId);
    return { success: true, customerPhone: phone ?? undefined };
  }

  const { error: insertErr } = await supabase.from('realtor_db_purchases').insert({
    realtor_id: realtorId,
    service_request_id: serviceRequestId,
  });
  if (insertErr) throw new Error(insertErr.message);

  const customerPhone = await getRealtorPurchasedCustomerPhone(realtorId, serviceRequestId);
  return { success: true, customerPhone: customerPhone ?? undefined };
}
