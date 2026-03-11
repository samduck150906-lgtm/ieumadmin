/**
 * 제휴업체용 DB 목록 (모자이크 규칙 적용)
 * - 배정된 DB: 전체 정보
 * - 미배정 + 본인 업종: 모자이크(이사 전/후 지역, 평수, 이사형태 4가지만) → 열람비 결제 후 해제
 */
import { createServerClient } from '../supabase';
import type { ServiceCategory } from '@/types/database';

/** 기존 평수 → 이사 가격 4단계 매핑 */
function mapAreaSizeToMovingTier(area?: string | null): string {
  if (!area) return 'under_10';
  if (area === 'under_10' || area === 'under_20' || area === 'under_30' || area === 'over_30') return area;
  if (area === 'under_12') return 'under_10';
  if (area === 'between_12_20') return 'under_20';
  if (area === 'over_20') return 'over_30';
  return 'under_10';
}

/** 평수 → 청소 예상 평수(평당×평수 계산용). area_pyeong_exact 우선 사용 */
function areaToPyeong(
  area?: string | null,
  areaPyeongExact?: number | null
): number {
  if (areaPyeongExact != null && !isNaN(areaPyeongExact) && areaPyeongExact > 0) return areaPyeongExact;
  if (!area) return 10;
  const map: Record<string, number> = {
    under_10: 10,
    under_20: 15,
    under_30: 25,
    over_30: 30,
    under_12: 10,
    between_12_20: 15,
    over_20: 25,
  };
  return map[area] ?? 15;
}

/** area_pyeong_exact → 이사 가격 구간 파생 */
function pyeongExactToAreaSize(pyeong?: number | null): string | null {
  if (pyeong == null || isNaN(pyeong) || pyeong <= 0) return null;
  if (pyeong <= 12) return 'under_12';
  if (pyeong <= 20) return 'between_12_20';
  return 'over_20';
}

/** 주소에서 시·도 + 시·군·구 단위만 추출 (마스킹 모드용) */
function extractMajorRegion(address?: string | null): string | null {
  if (!address) return null;
  const parts = address.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0]} ${parts[1]}`;
  if (parts.length === 1) return parts[0] ?? null;
  return null;
}

export type PartnerDbRow = {
  id: string;
  category: ServiceCategory;
  created_at: string;
  masked: boolean;
  view_price?: number;
  // 배정 시 또는 결제 후: 전체
  customer_name?: string;
  customer_phone?: string;
  current_address?: string | null;
  moving_address?: string | null;
  moving_date?: string | null;
  area_size?: string | null;
  moving_type?: string | null;
  hq_status?: string;
  assigned_partner_id?: string | null;
  partner_assignment?: { status: string; installation_date?: string | null } | null;
  // 모자이크 시에도 노출 (4가지)
  from_region?: string | null;
  to_region?: string | null;
  area_size_label?: string | null;
  moving_type_label?: string | null;
};

export interface PartnerDbListFilter {
  category?: string;
  region?: string;
  areaSize?: string;
  /** 이사날짜 구간 필터 */
  dateFrom?: string;
  dateTo?: string;
  /** 이사날짜 중복선택 — YYYY-MM-DD 배열, moving_date가 포함된 건만 (OR 조건) */
  movingDates?: string[];
  /** 희망상품: 이사종류(moving_type) 또는 인터넷종류(requested_product) */
  movingType?: string;
  requestedProduct?: string;
}

/** 서버 전용: 제휴업체 ID로 DB 목록 (모자이크/전체 구분, 서버사이드 필터링) */
export async function getPartnerDbList(partnerId: string, filter?: PartnerDbListFilter): Promise<PartnerDbRow[]> {
  const supabase = createServerClient();
  if (!supabase) throw new Error('서버 Supabase 미설정');

  const { data: partner } = await supabase
    .from('partners')
    .select('id, service_categories')
    .eq('id', partnerId)
    .single();
  if (!partner?.service_categories?.length) return [];

  const categories = partner.service_categories as string[];

  const { data: paidRows } = await supabase
    .from('db_view_payments')
    .select('service_request_id')
    .eq('partner_id', partnerId);
  const paidSet = new Set((paidRows || []).map((r: { service_request_id: string }) => r.service_request_id));

  // DB 마켓: 미배정 + 업무카테고리 일치 DB만 구매 가능 목록으로 조회 (배정된 건은 내 DB 관리에서만)
  const unassignedRes = await supabase
    .from('service_requests')
    .select(`
      id, category, hq_status, assigned_partner_id, created_at, requested_product,
      customer:customers!service_requests_customer_id_fkey (
        id, name, phone, current_address, moving_address, moving_date, area_size, area_pyeong_exact, moving_type
      )
    `)
    .is('assigned_partner_id', null)
    .in('category', categories.length > 0 ? categories : ['moving', 'cleaning', 'internet_tv']);

  const rawList = unassignedRes.data ?? [];
  const requests = rawList.filter((r: { id: string }) => !paidSet.has(r.id));

  const rows: PartnerDbRow[] = [];
  const areaLabels: Record<string, string> = {
    under_10: '~10평',
    under_20: '~20평',
    under_30: '~30평',
    over_30: '30평 이상',
    under_12: '12평 이하',
    between_12_20: '12~20평',
    over_20: '20평 이상',
  };
  const movingLabels: Record<string, string> = {
    general: '일반이사',
    full_pack: '포장이사',
    half_pack: '반포장이사',
  };

  for (const req of requests) {
    const customer = Array.isArray(req.customer) ? req.customer[0] : req.customer;
    const isPaid = paidSet.has(req.id);
    const isAssigned = req.assigned_partner_id === partnerId;
    const showFull = isAssigned || isPaid;

    // 정확한 평수 우선, 없으면 구간 라벨
    const areaSizeLabel = customer?.area_pyeong_exact != null
      ? `${customer.area_pyeong_exact}평`
      : customer?.area_size
        ? areaLabels[customer.area_size] ?? customer.area_size
        : null;
    const movingTypeLabel = customer?.moving_type ? movingLabels[customer.moving_type] ?? customer.moving_type : null;

    // 마스킹 모드: 시·도 + 시·군·구만 노출 (전체 주소 절대 노출 금지)
    const fromRegion = extractMajorRegion(customer?.current_address || customer?.moving_address);
    const toRegion = extractMajorRegion(customer?.moving_address);

    // 서버사이드 필터링
    if (filter?.category && req.category !== filter.category) continue;
    if (filter?.region) {
      const regionMatch = (fromRegion || '').includes(filter.region) || (toRegion || '').includes(filter.region);
      if (!regionMatch) continue;
    }
    if (filter?.areaSize && customer?.area_size !== filter.areaSize) continue;
    if (filter?.movingDates?.length) {
      const md = customer?.moving_date ? String(customer.moving_date).slice(0, 10) : null;
      if (!md || !filter.movingDates.includes(md)) continue;
    } else if (filter?.dateFrom || filter?.dateTo) {
      const md = customer?.moving_date ? String(customer.moving_date).slice(0, 10) : null;
      if (!md) continue;
      if (filter.dateFrom && md < filter.dateFrom) continue;
      if (filter.dateTo && md > filter.dateTo) continue;
    }
    if (filter?.movingType && customer?.moving_type !== filter.movingType) continue;
    if (filter?.requestedProduct) {
      const rp = (req as { requested_product?: string | null }).requested_product;
      if (!rp || !String(rp).toLowerCase().includes(filter.requestedProduct.toLowerCase())) continue;
    }

    let view_price: number | undefined;
    if (!showFull) {
      view_price = await getDbViewPrice(req.category as ServiceCategory, customer);
    }

    rows.push({
      id: req.id,
      category: req.category,
      created_at: req.created_at,
      masked: !showFull,
      view_price,
      from_region: fromRegion ?? undefined,
      to_region: toRegion ?? undefined,
      area_size_label: areaSizeLabel,
      moving_type_label: movingTypeLabel,
      // 마스킹 모드: 이사일자 비노출 (결제 후 열람 시에만 노출)
      moving_date: showFull ? (customer?.moving_date ?? undefined) : undefined,
      ...(showFull
        ? {
            customer_name: customer?.name,
            customer_phone: customer?.phone,
            current_address: customer?.current_address,
            moving_address: customer?.moving_address,
            area_size: customer?.area_size,
            moving_type: customer?.moving_type,
            hq_status: req.hq_status,
            assigned_partner_id: req.assigned_partner_id,
            partner_assignment: null,
          }
        : {}),
    });
  }

  return rows.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

/** DB 열람가 조회 (서비스 요청 + 고객 정보로 가격 결정) - 열람가격(지정가) */
export async function getDbViewPrice(
  category: ServiceCategory,
  customer?: { area_size?: string | null; area_pyeong_exact?: number | null; moving_type?: string | null }
): Promise<number> {
  const supabase = createServerClient();
  if (!supabase) return 0;

  if (category === 'moving' && customer) {
    const derivedArea = pyeongExactToAreaSize(customer.area_pyeong_exact) ?? customer.area_size;
    const area = mapAreaSizeToMovingTier(derivedArea);
    const { data } = await supabase
      .from('db_price_moving')
      .select('view_price')
      .eq('area_size', area)
      .eq('moving_type', customer.moving_type || 'general')
      .limit(1)
      .single();
    return Number(data?.view_price ?? 0);
  }
  if (category === 'cleaning') {
    const { data } = await supabase.from('db_price_cleaning').select('view_price').limit(1).single();
    return Number(data?.view_price ?? 0);
  }
  if (category === 'internet_tv') {
    const { data } = await supabase.from('db_price_internet').select('view_price').eq('internet_type', 'internet_tv').limit(1).single();
    return Number(data?.view_price ?? 0);
  }
  const { data } = await supabase.from('db_price_internet').select('view_price').eq('internet_type', 'internet_only').limit(1).single();
  return Number(data?.view_price ?? 0);
}

/** DB 완료가 조회 (partner_assignments 기록용). area_pyeong_exact 우선 사용 */
export async function getDbCompletionPrice(
  category: ServiceCategory,
  customer?: { area_size?: string | null; area_pyeong_exact?: number | null; moving_type?: string | null }
): Promise<number> {
  const supabase = createServerClient();
  if (!supabase) return 0;

  const pyeongFromCustomer = areaToPyeong(customer?.area_size, customer?.area_pyeong_exact);

  if (category === 'moving' && customer) {
    const derivedArea = pyeongExactToAreaSize(customer.area_pyeong_exact) ?? customer.area_size;
    const area = mapAreaSizeToMovingTier(derivedArea);
    const { data } = await supabase
      .from('db_price_moving')
      .select('price_per_pyeong')
      .eq('area_size', area)
      .eq('moving_type', customer.moving_type || 'general')
      .limit(1)
      .single();
    const per = Number(data?.price_per_pyeong ?? 0);
    return per * pyeongFromCustomer;
  }
  if (category === 'cleaning') {
    const { data } = await supabase.from('db_price_cleaning').select('price_per_pyeong, max_completion_fee').limit(1).single();
    const per = Number(data?.price_per_pyeong ?? 0);
    let amount = per * pyeongFromCustomer;
    const maxFee = data?.max_completion_fee != null ? Number(data.max_completion_fee) : null;
    if (maxFee != null && maxFee > 0 && amount > maxFee) amount = maxFee;
    return amount;
  }
  if (category === 'internet_tv') {
    const { data } = await supabase.from('db_price_internet').select('price_per_pyeong').eq('internet_type', 'internet_tv').limit(1).single();
    const per = Number(data?.price_per_pyeong ?? 0);
    const pyeong = Math.max(pyeongFromCustomer, 15);
    return per * pyeong;
  }
  const { data } = await supabase.from('db_price_internet').select('price_per_pyeong').eq('internet_type', 'internet_only').limit(1).single();
  const per = Number(data?.price_per_pyeong ?? 0);
  const pyeong = Math.max(pyeongFromCustomer, 15);
  return per * pyeong;
}

/** 0원 구매 후 10분 재구매 대기 여부 (DB 독점 방지). true면 대기 중이라 0원 구매 불가 */
export async function isZeroWonPurchaseInCooldown(partnerId: string): Promise<boolean> {
  const supabase = createServerClient();
  if (!supabase) return true;
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('db_view_payments')
    .select('id')
    .eq('partner_id', partnerId)
    .eq('amount', 0)
    .gte('paid_at', tenMinAgo)
    .limit(1)
    .maybeSingle();
  return data != null;
}

/** 열람 비용 결제 기록 (모자이크 해제) */
export async function recordDbViewPayment(
  partnerId: string,
  serviceRequestId: string,
  amount: number,
  paymentMethod?: string
): Promise<void> {
  const supabase = createServerClient();
  if (!supabase) throw new Error('서버 Supabase 미설정');
  const { error } = await supabase.from('db_view_payments').insert({
    partner_id: partnerId,
    service_request_id: serviceRequestId,
    amount,
    paid_at: new Date().toISOString(),
    payment_method: paymentMethod || (amount === 0 ? 'free' : 'card'),
  });
  if (error) throw error;
}
