import { getSupabase } from '../supabase';

export interface SiteSettings {
  id: string;
  service_name: string;
  contact_phone: string;
  commission_rate: number;
  referral_duration_months: number;
  auto_complete_enabled: boolean;
  auto_complete_days: number;
  /** 고객 초대 시 사용하는 기본 문구 (변동 구간). ㅇ~ㅇ 사이 수정 가능. */
  default_invite_message: string | null;
  /** 부동산 수익쉐어 비율(%) - 상담요청 시. 참고용. */
  realtor_share_consultation_pct: number | null;
  /** 부동산 수익쉐어 비율(%) - 전체완료 시. 참고용. */
  realtor_share_complete_pct: number | null;
  /** 마일리지 1단계 기준금액(원) — 기본 200만원 */
  mileage_tier1_threshold: number | null;
  /** 마일리지 1단계 요율(%) — 기본 3% */
  mileage_tier1_pct: number | null;
  /** 마일리지 2단계 기준금액(원) — 기본 500만원 */
  mileage_tier2_threshold: number | null;
  /** 마일리지 2단계 요율(%) — 기본 5% */
  mileage_tier2_pct: number | null;
  /** 메인터넌스(점검) 모드. true면 서비스 점검 안내 등에 사용 */
  maintenance_mode?: boolean;
  /** 관리자 알림 설정 */
  notification_prefs?: {
    newRequest?: boolean;
    assignComplete?: boolean;
    withdrawRequest?: boolean;
    paymentComplete?: boolean;
  } | null;
  updated_at: string;
}

export async function getSiteSettings(): Promise<SiteSettings | null> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('site_settings')
    .select('*')
    .limit(1)
    .single();
  if (error) return null;
  return data as SiteSettings;
}

export async function updateSiteSettings(updates: Partial<Omit<SiteSettings, 'id' | 'updated_at'>>): Promise<void> {
  const supabase = getSupabase();
  const row = await getSiteSettings();
  if (!row) throw new Error('설정을 불러올 수 없습니다.');
  const { error } = await supabase
    .from('site_settings')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) throw error;
}

/** 약관/정책 문서 (site_terms) */
export interface SiteTermRow {
  key: string;
  title: string;
  body: string;
  updated_at: string;
}

export async function getSiteTerms(): Promise<SiteTermRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase.from('site_terms').select('*').order('key');
  if (error) throw error;
  return (data ?? []) as SiteTermRow[];
}

export async function updateSiteTerm(key: string, title: string, body: string): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('site_terms')
    .upsert({ key, title, body, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw error;
}

/** 업종별 공인중개사 수익쉐어 및 제휴업체 결제 요청 기본 금액 */
export interface RealtorRevenueShareDefault {
  id: string;
  category: string;
  /** 상담요청 시 중개사 수익쉐어 금액 (원) */
  realtor_commission_amount: number | null;
  /** 전체완료 시 중개사 수익쉐어 금액 (원) */
  realtor_commission_complete_amount: number | null;
  /** 추천수익 비율 (%, 기본 5.00) */
  referral_pct: number | null;
  /** 추천수익 적용 기간 (개월, 기본 12) */
  referral_duration_months: number | null;
  partner_payment_request_amount: number | null;
  memo: string | null;
  updated_at: string;
}

export async function getRealtorRevenueShareDefaults(): Promise<RealtorRevenueShareDefault[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('realtor_revenue_share_defaults')
    .select('*')
    .order('category');
  if (error) return [];
  return (data ?? []) as RealtorRevenueShareDefault[];
}

export async function upsertRealtorRevenueShareDefault(
  category: string,
  updates: {
    realtor_commission_amount?: number | null;
    realtor_commission_complete_amount?: number | null;
    referral_pct?: number | null;
    referral_duration_months?: number | null;
    partner_payment_request_amount?: number | null;
    memo?: string | null;
  }
): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase
    .from('realtor_revenue_share_defaults')
    .upsert(
      { category, ...updates, updated_at: new Date().toISOString() },
      { onConflict: 'category' }
    );
  if (error) throw error;
}

/** DB 가격 버전/스냅샷 */
export interface DbPriceVersion {
  id: string;
  version_label: string | null;
  applied_at: string;
  snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export async function getDbPriceVersions(limit = 10): Promise<DbPriceVersion[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('db_price_versions')
    .select('id, version_label, applied_at, created_at')
    .order('applied_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as DbPriceVersion[];
}

export async function createDbPriceVersion(payload: {
  version_label?: string | null;
  applied_at: string;
  snapshot: Record<string, unknown>;
}): Promise<void> {
  const supabase = getSupabase();
  const { error } = await supabase.from('db_price_versions').insert({
    version_label: payload.version_label ?? null,
    applied_at: payload.applied_at,
    snapshot: payload.snapshot,
  });
  if (error) throw error;
}
