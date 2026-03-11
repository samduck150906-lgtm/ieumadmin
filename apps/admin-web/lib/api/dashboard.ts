import { getSupabaseOrServer } from '../supabase';
import { getInactiveRealtors } from './realtors';
import type {
  RecentRequestItem,
  ServiceCategory,
  HqStatus,
  DashboardDateFilter,
  CategoryStatBreakdown,
  DashboardStatsResponse,
  FinancialSummary,
  CancelledOrComplaintItem,
  PartnerRatingListItem,
  PartnerConversionListItem,
} from '@/types/database';

/** 퍼널 뷰 모달용 단계별 데이터 */
export interface FunnelDataItem {
  stage: string;
  label: string;
  count: number;
  rate?: number;
}

/** 타임라인 뷰 모달용 완료 건 항목 */
export interface TimelineItem {
  id: string;
  completedAt: string;
  categoryLabel: string;
  customerName?: string;
}

const now = () => new Date();
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
const startOfLastMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() - 1, 1).toISOString();
const endOfLastMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59).toISOString();

function getDateRange(filter: DashboardDateFilter): { start: string; end: string } {
  const d = now();
  const todayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  const todayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString();
  const yesterdayStart = new Date(d);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const yesterdayEnd = new Date(yesterdayStart);
  yesterdayEnd.setHours(23, 59, 59, 999);
  const sevenDaysAgo = new Date(d);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  const sevenDaysStart = new Date(sevenDaysAgo.getFullYear(), sevenDaysAgo.getMonth(), sevenDaysAgo.getDate()).toISOString();

  switch (filter) {
    case 'this_month':
      return { start: startOfMonth(d), end: endOfMonth(d) };
    case 'last_month':
      return { start: startOfLastMonth(d), end: endOfLastMonth(d) };
    case 'last_7_days':
      return { start: sevenDaysStart, end: todayEnd };
    case 'today':
      return { start: todayStart, end: todayEnd };
    case 'yesterday':
      return { start: yesterdayStart.toISOString(), end: yesterdayEnd.toISOString() };
    default:
      return { start: startOfMonth(d), end: endOfMonth(d) };
  }
}

// 카테고리별 상담현황 (날짜 필터 + 상태별 breakdown)
async function getCategoryStatsWithBreakdown(
  supabase: ReturnType<typeof getSupabaseOrServer>,
  dateFilter: DashboardDateFilter
): Promise<Record<string, CategoryStatBreakdown>> {
  const { start, end } = getDateRange(dateFilter);
  const categories = ['moving', 'cleaning', 'internet_tv', 'interior', 'appliance_rental', 'kiosk'];
  const init: Record<string, CategoryStatBreakdown> = {};
  categories.forEach(cat => {
    init[cat] = { total: 0, unassigned: 0, inProgress: 0, reserved: 0, delayed: 0, settlement_check: 0, settlement_done: 0 };
  });

  const { data: requests } = await supabase
    .from('service_requests')
    .select('id, category, hq_status, assigned_partner_id')
    .gte('created_at', start)
    .lte('created_at', end);
  if (!requests?.length) return init;

  const srIds = requests.map((r: { id: string }) => r.id);
  const [paList, dvpList] = await Promise.all([
    supabase.from('partner_assignments').select('service_request_id, status').in('service_request_id', srIds),
    supabase.from('db_view_payments').select('service_request_id, paid_at').in('service_request_id', srIds),
  ]);
  const paBySr = new Map<string, { status: string }>();
  (paList.data || []).forEach((pa: { service_request_id: string; status: string }) => {
    paBySr.set(pa.service_request_id, { status: pa.status });
  });
  const dvpBySr = new Map<string, { paid_at: string }>();
  (dvpList.data || []).forEach((d: { service_request_id: string; paid_at: string }) => {
    dvpBySr.set(d.service_request_id, { paid_at: d.paid_at });
  });

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const delayedIds = new Set<string>();
  requests.forEach((r: { id: string; assigned_partner_id: string | null; hq_status: string }) => {
    if (!r.assigned_partner_id) return;
    const pa = paBySr.get(r.id);
    if (!pa || ['reserved', 'completed', 'cancelled'].includes(pa.status)) return;
    const dvp = dvpBySr.get(r.id);
    if (!dvp?.paid_at || dvp.paid_at >= twentyFourHoursAgo) return;
    if (!['settlement_check', 'settlement_done'].includes(r.hq_status)) delayedIds.add(r.id);
  });

  requests.forEach((r: { id: string; category: string; hq_status: string; assigned_partner_id: string | null }) => {
    const cat = r.category || 'moving';
    if (!init[cat]) init[cat] = { total: 0, unassigned: 0, inProgress: 0, reserved: 0, delayed: 0, settlement_check: 0, settlement_done: 0 };
    init[cat].total++;

    if (r.hq_status === 'unread' || r.hq_status === 'read') {
      init[cat].unassigned++;
      return;
    }
    if (r.hq_status === 'settlement_check') {
      init[cat].settlement_check++;
      return;
    }
    if (r.hq_status === 'settlement_done') {
      init[cat].settlement_done++;
      return;
    }
    if (r.hq_status === 'cancelled') {
      init[cat].inProgress++;
      return;
    }
    if (r.hq_status === 'assigned') {
      const pa = paBySr.get(r.id);
      if (pa?.status === 'reserved') {
        init[cat].reserved++;
        return;
      }
      if (delayedIds.has(r.id)) {
        init[cat].delayed++;
        return;
      }
      init[cat].inProgress++;
    }
  });
  return init;
}

// 대시보드 전체 통계 (고객 요구사항 반영)
export async function getDashboardStats(params?: { dateFilter?: DashboardDateFilter }): Promise<DashboardStatsResponse> {
  const supabase = getSupabaseOrServer();
  const today = now();
  const thisStart = startOfMonth(today);
  const thisEnd = endOfMonth(today);
  const lastStart = startOfLastMonth(today);
  const lastEnd = endOfLastMonth(today);
  const dateFilter = params?.dateFilter ?? 'this_month';

  // 클라이언트 사이드 Supabase 쿼리 — 인증은 쿠키/localStorage에서 자동 처리

  // 독립 쿼리를 모두 한 번에 병렬 실행 (순차 실행 제거)
  const [
    realtorRes,
    partnerRes,
    realtorThisMonth,
    partnerThisMonth,
    thisMonthReqs,
    lastMonthReqs,
    completedThisMonthRes,
    thisMonthWithdrawalsRes,
    unassignedRes,
    pendingWithdrawalsRes,
    accountPendingRes,
    realtorNewSignupsRes,
    partnerAppPendingRes,
    completedRequestsRes,
    inquiryPendingRes,
    categoryStats,
    financialSummary,
    inactiveRealtorCount,
  ] = await Promise.all([
    supabase.from('realtors').select('*', { count: 'exact', head: true }),
    supabase.from('partners').select('*', { count: 'exact', head: true }),
    supabase.from('realtors').select('*', { count: 'exact', head: true }).gte('created_at', thisStart).lte('created_at', thisEnd),
    supabase.from('partners').select('*', { count: 'exact', head: true }).gte('created_at', thisStart).lte('created_at', thisEnd),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).gte('created_at', thisStart).lte('created_at', thisEnd),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).gte('created_at', lastStart).lte('created_at', lastEnd),
    supabase.from('service_requests').select('*', { count: 'exact', head: true }).gte('created_at', thisStart).lte('created_at', thisEnd).eq('hq_status', 'settlement_done'),
    supabase.from('withdrawal_requests').select('amount').eq('status', 'completed').gte('created_at', thisStart).lte('created_at', thisEnd),
    supabase.from('service_requests').select('*', { count: 'exact', head: true }).in('hq_status', ['unread', 'read']),
    supabase.from('withdrawal_requests').select('*', { count: 'exact', head: true }).eq('status', 'requested'),
    supabase.from('realtors').select('*', { count: 'exact', head: true }).eq('account_verified', false),
    supabase.from('realtors').select('*', { count: 'exact', head: true }).gte('created_at', thisStart).lte('created_at', thisEnd),
    supabase.from('partner_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('service_requests').select('id, customer:customers!service_requests_customer_id_fkey(source_realtor_id)').gte('created_at', thisStart).lte('created_at', thisEnd).eq('hq_status', 'settlement_done'),
    supabase.from('db_consultations').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    getCategoryStatsWithBreakdown(supabase, dateFilter),
    getFinancialSummary(supabase, thisStart, thisEnd),
    getInactiveRealtors({ inactiveDays: 14, limit: 0 }).then((r) => r.total),
  ]);

  // 집계 계산
  const realtorCount = realtorRes.count ?? 0;
  const partnerCount = partnerRes.count ?? 0;
  const totalMembers = realtorCount + partnerCount;
  const membersIncreaseThisMonth = (realtorThisMonth.count ?? 0) + (partnerThisMonth.count ?? 0);
  const thisMonthRequests = thisMonthReqs.count ?? 0;
  const lastMonthRequests = lastMonthReqs.count ?? 0;
  const requestDiff = lastMonthRequests > 0 ? thisMonthRequests - lastMonthRequests : 0;
  const completedCount = completedThisMonthRes.count ?? 0;
  const conversionRate = thisMonthRequests > 0 ? Math.round((completedCount / thisMonthRequests) * 100) : 0;
  const thisMonthSettlementAmount = (thisMonthWithdrawalsRes.data ?? []).reduce((s, w) => s + Number(w.amount), 0);
  const unassignedCount = unassignedRes.count ?? 0;
  const pendingWithdrawals = pendingWithdrawalsRes.count ?? 0;
  const accountPendingCount = accountPendingRes.count ?? 0;
  const realtorNewSignupsCount = realtorNewSignupsRes.count ?? 0;
  const partnerApplicationPendingCount = partnerAppPendingRes.count ?? 0;
  const newSignupsCount = realtorNewSignupsCount + partnerApplicationPendingCount;
  const inquiryPendingCount = inquiryPendingRes.count ?? 0;

  // 상위 중개사 랭킹 (completedRequestsRes 결과 기반, 추가 쿼리 1회)
  const realtorIdCount: Record<string, number> = {};
  (completedRequestsRes.data ?? []).forEach((r: unknown) => {
    const row = r as Record<string, unknown>;
    const cust = row.customer as { source_realtor_id?: string } | { source_realtor_id?: string }[] | undefined;
    const customer = Array.isArray(cust) ? cust[0] : cust;
    const rid = customer?.source_realtor_id;
    if (rid) realtorIdCount[rid] = (realtorIdCount[rid] ?? 0) + 1;
  });
  const topRealtorIds = Object.entries(realtorIdCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);
  let topRealtors: { business_name: string; conversionCount: number; amount?: number }[] = [];
  if (topRealtorIds.length > 0) {
    const { data: realtors } = await supabase.from('realtors').select('id, business_name').in('id', topRealtorIds);
    topRealtors = topRealtorIds.map(id => {
      const r = realtors?.find((x: { id: string; business_name?: string }) => x.id === id);
      return { business_name: r?.business_name ?? '-', conversionCount: realtorIdCount[id] ?? 0, amount: 0 };
    });
  }

  return {
    realtorCount,
    partnerCount,
    totalMembers,
    membersIncreaseThisMonth,
    thisMonthRequests,
    lastMonthRequests,
    requestDiff,
    completedCount,
    conversionRate,
    thisMonthSettlementAmount,
    unassignedCount,
    pendingWithdrawals,
    accountPendingCount,
    newSignupsCount,
    inquiryPendingCount,
    categoryStats,
    topRealtors,
    realtorNewSignupsCount,
    partnerApplicationPendingCount,
    inactiveRealtorCount: inactiveRealtorCount ?? 0,
    financialSummary,
  };
}

async function getFinancialSummary(
  supabase: ReturnType<typeof getSupabaseOrServer>,
  monthStart: string,
  monthEnd: string
): Promise<FinancialSummary> {
  const d = now();
  const prevStart = startOfLastMonth(d);
  const prevEnd = endOfLastMonth(d);

  try {
    const [
      unpaidRes,
      completedWithdrawals,
      realtorAssignmentsRes,
      claimPendingRes,
      claimCompletedRes,
      thisMonthReceivablesRes,
      prevMonthWithdrawals,
      prevUnpaidRes,
    ] = await Promise.all([
      // 미수금: 미납된 전체 미수
      supabase.from('partner_receivables').select('amount').eq('is_paid', false),
      // 당월 출금 완료 (제휴업체 정산 수납)
      supabase.from('withdrawal_requests').select('amount').eq('status', 'completed')
        .gte('created_at', monthStart).lte('created_at', monthEnd),
      // 공인중개사 배정액(예상): 당월 예약완료/완료 배정 중 수익쉐어 금액
      supabase.from('partner_assignments')
        .select('realtor_commission_amount')
        .not('realtor_commission_amount', 'is', null)
        .gt('realtor_commission_amount', 0)
        .in('status', ['reserved', 'completed'])
        .gte('created_at', monthStart).lte('created_at', monthEnd),
      // 당월 청구액 (신청+승인 대기)
      supabase.from('withdrawal_requests').select('amount, status')
        .in('status', ['requested', 'approved'])
        .gte('created_at', monthStart).lte('created_at', monthEnd),
      // 당월 출금 완료 (공인중개사 기준)
      supabase.from('withdrawal_requests').select('amount').eq('status', 'completed')
        .gte('created_at', monthStart).lte('created_at', monthEnd),
      // 당월 발생 미수 (납부 여부 무관)
      supabase.from('partner_receivables').select('amount, is_paid')
        .gte('receivable_month', monthStart.slice(0, 10))
        .lte('receivable_month', monthEnd.slice(0, 10)),
      // 전월 출금 완료 (트렌드용)
      supabase.from('withdrawal_requests').select('amount').eq('status', 'completed')
        .gte('created_at', prevStart).lte('created_at', prevEnd),
      // 전월 미수금 (트렌드용)
      supabase.from('partner_receivables').select('amount').eq('is_paid', false)
        .lt('receivable_month', monthStart.slice(0, 10)),
    ]);

    const unpaidAmount = (unpaidRes.data || []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const unpaidCount = unpaidRes.data?.length ?? 0;

    const settlementAmount = (completedWithdrawals.data || []).reduce((s, w) => s + Number(w.amount ?? 0), 0);

    const realtorAssignmentAmount = (realtorAssignmentsRes.data || [])
      .reduce((s, c) => s + Number(c.realtor_commission_amount ?? 0), 0);
    const realtorAssignmentCount = realtorAssignmentsRes.data?.length ?? 0;

    const realtorMonthlyClaimAmount = (claimPendingRes.data || [])
      .reduce((s, w) => s + Number(w.amount ?? 0), 0);
    const realtorClaimPendingCount = claimPendingRes.data?.length ?? 0;

    const realtorClaimCompletedAmount = (claimCompletedRes.data || [])
      .reduce((s, w) => s + Number(w.amount ?? 0), 0);

    const thisMonthReceivables = thisMonthReceivablesRes.data || [];
    const totalReceivableThisMonth = thisMonthReceivables.reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const paidReceivableThisMonth = thisMonthReceivables
      .filter((r) => r.is_paid)
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // 공제 후 순수익 = 수납완료 - 중개사 출금완료 (배정액 기준 예상 포함)
    const totalRealtorCost = realtorClaimCompletedAmount + realtorMonthlyClaimAmount;
    const expectedProfitAfterDeduction = Math.max(0, settlementAmount - totalRealtorCost);

    const prevMonthSettlementAmount = (prevMonthWithdrawals.data || [])
      .reduce((s, w) => s + Number(w.amount ?? 0), 0);
    const prevMonthUnpaidAmount = (prevUnpaidRes.data || [])
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    return {
      unpaidAmount,
      unpaidCount,
      settlementAmount,
      realtorAssignmentAmount,
      realtorAssignmentCount,
      realtorMonthlyClaimAmount,
      realtorClaimCompletedAmount,
      realtorClaimPendingCount,
      expectedProfitAfterDeduction,
      totalReceivableThisMonth,
      paidReceivableThisMonth,
      prevMonthSettlementAmount,
      prevMonthUnpaidAmount,
    };
  } catch {
    return {
      unpaidAmount: 0, unpaidCount: 0,
      settlementAmount: 0,
      realtorAssignmentAmount: 0, realtorAssignmentCount: 0,
      realtorMonthlyClaimAmount: 0, realtorClaimCompletedAmount: 0, realtorClaimPendingCount: 0,
      expectedProfitAfterDeduction: 0,
      totalReceivableThisMonth: 0, paidReceivableThisMonth: 0,
      prevMonthSettlementAmount: 0, prevMonthUnpaidAmount: 0,
    };
  }
}

// 최근 서비스 요청 목록 (Supabase relation은 배열로 올 수 있으므로 정규화)
export async function getRecentRequests(limit: number = 5): Promise<RecentRequestItem[]> {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('service_requests')
    .select(`
      id,
      category,
      hq_status,
      created_at,
      customer:customers!service_requests_customer_id_fkey (
        name, phone
      )
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const list = data || [];
  return list.map((row: Record<string, unknown>) => {
    const cust = row.customer as { name?: string; phone?: string } | { name?: string; phone?: string }[] | undefined;
    const customer = Array.isArray(cust) ? cust[0] : cust;
    const item: RecentRequestItem = {
      id: String(row.id ?? ''),
      category: (row.category as ServiceCategory) ?? 'moving',
      hq_status: (row.hq_status as HqStatus) ?? 'unread',
      created_at: String(row.created_at ?? ''),
      customer: customer ? { name: String(customer.name ?? ''), phone: String(customer.phone ?? '') } : undefined,
    };
    return item;
  });
}

/** 진행중 취소건 + 불만건(평점 낮거나 불만 유입) 리스트 */
export async function getCancelledAndComplaintRequests(limit: number = 20): Promise<CancelledOrComplaintItem[]> {
  const supabase = getSupabaseOrServer();
  const { data: cancelled } = await supabase
    .from('service_requests')
    .select(`
      id, category, hq_status, created_at,
      customer:customers!service_requests_customer_id_fkey (name, phone),
      assigned_partner:partners!service_requests_assigned_partner_id_fkey (business_name)
    `)
    .eq('hq_status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(limit);
  const { data: reviews } = await supabase
    .from('reviews')
    .select('service_request_id, rating')
    .eq('rating', 'unsatisfied')
    .order('created_at', { ascending: false })
    .limit(limit * 2);
  const complaintSrIds = new Set((reviews || []).map((r: { service_request_id: string }) => r.service_request_id));
  const ratingBySr = new Map<string, string>();
  (reviews || []).forEach((r: { service_request_id: string; rating: string }) => ratingBySr.set(r.service_request_id, r.rating));
  const items: CancelledOrComplaintItem[] = [];
  const seen = new Set<string>();
  (cancelled || []).forEach((row: Record<string, unknown>) => {
    const id = String(row.id);
    if (seen.has(id)) return;
    seen.add(id);
    const cust = row.customer as { name?: string; phone?: string } | Array<{ name?: string; phone?: string }> | undefined;
    const customer = Array.isArray(cust) ? cust[0] : cust;
    const partner = row.assigned_partner as { business_name?: string } | Array<{ business_name?: string }> | undefined;
    const partnerName = Array.isArray(partner) ? partner[0]?.business_name : partner?.business_name;
    items.push({
      id,
      category: (row.category as ServiceCategory) ?? 'moving',
      hq_status: (row.hq_status as HqStatus) ?? 'unread',
      created_at: String(row.created_at ?? ''),
      customer: customer ? { name: String(customer.name ?? ''), phone: String(customer.phone ?? '') } : undefined,
      reason: 'cancelled',
      partner_name: partnerName,
    });
  });
  if (complaintSrIds.size > 0) {
    const { data: complaintReqs } = await supabase
      .from('service_requests')
      .select(`
        id, category, hq_status, created_at,
        customer:customers!service_requests_customer_id_fkey (name, phone),
        assigned_partner:partners!service_requests_assigned_partner_id_fkey (business_name)
      `)
      .in('id', Array.from(complaintSrIds))
      .order('created_at', { ascending: false });
    (complaintReqs || []).forEach((row: Record<string, unknown>) => {
      const id = String(row.id);
      if (seen.has(id)) return;
      seen.add(id);
      const cust = row.customer as { name?: string; phone?: string } | Array<{ name?: string; phone?: string }> | undefined;
      const customer = Array.isArray(cust) ? cust[0] : cust;
      const partner = row.assigned_partner as { business_name?: string } | Array<{ business_name?: string }> | undefined;
      const partnerName = Array.isArray(partner) ? partner[0]?.business_name : partner?.business_name;
      items.push({
        id,
        category: (row.category as ServiceCategory) ?? 'moving',
        hq_status: (row.hq_status as HqStatus) ?? 'unread',
        created_at: String(row.created_at ?? ''),
        customer: customer ? { name: String(customer.name ?? ''), phone: String(customer.phone ?? '') } : undefined,
        reason: 'complaint',
        rating: 'unsatisfied',
        partner_name: partnerName,
      });
    });
  }
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return items.slice(0, limit);
}

/** 제휴업체 카테고리 통합 — 평점 낮은순 / 불만(unsatisfied) 많은순 리스트 */
export async function getPartnersByRatingOrComplaints(limit: number = 20): Promise<PartnerRatingListItem[]> {
  const supabase = getSupabaseOrServer();
  const { data: partners } = await supabase
    .from('partners')
    .select('id, business_name, service_categories, avg_rating, total_reviews')
    .order('avg_rating', { ascending: true })
    .not('total_reviews', 'is', null)
    .limit(limit * 2);
  const { data: unsatisfiedCounts } = await supabase
    .from('reviews')
    .select('partner_id')
    .eq('rating', 'unsatisfied');
  const unsatisfiedByPartner = new Map<string, number>();
  (unsatisfiedCounts || []).forEach((r: { partner_id: string }) => {
    unsatisfiedByPartner.set(r.partner_id, (unsatisfiedByPartner.get(r.partner_id) ?? 0) + 1);
  });
  const list: PartnerRatingListItem[] = (partners || []).map((p: { id: string; business_name: string; service_categories: ServiceCategory[]; avg_rating: number; total_reviews: number }) => ({
    id: p.id,
    business_name: p.business_name ?? '-',
    service_categories: p.service_categories ?? [],
    avg_rating: Number(p.avg_rating ?? 0),
    total_reviews: Number(p.total_reviews ?? 0),
    unsatisfied_count: unsatisfiedByPartner.get(p.id) ?? 0,
  }));
  list.sort((a, b) => b.unsatisfied_count - a.unsatisfied_count || a.avg_rating - b.avg_rating);
  return list.slice(0, limit);
}

/** 제휴업체 DB 배정·구매 전환률 낮은순 (전환 기준: 예약완료) */
export async function getPartnersByConversionRate(limit: number = 20): Promise<PartnerConversionListItem[]> {
  const supabase = getSupabaseOrServer();
  const { data: paList } = await supabase
    .from('partner_assignments')
    .select('partner_id, status');
  const assignedByPartner = new Map<string, number>();
  const reservedByPartner = new Map<string, number>();
  (paList || []).forEach((pa: { partner_id: string; status: string }) => {
    assignedByPartner.set(pa.partner_id, (assignedByPartner.get(pa.partner_id) ?? 0) + 1);
    if (pa.status === 'reserved') {
      reservedByPartner.set(pa.partner_id, (reservedByPartner.get(pa.partner_id) ?? 0) + 1);
    }
  });
  const partnerIds = Array.from(assignedByPartner.keys());
  if (partnerIds.length === 0) return [];
  const { data: partners } = await supabase
    .from('partners')
    .select('id, business_name, service_categories')
    .in('id', partnerIds);
  const list: PartnerConversionListItem[] = (partners || []).map((p: { id: string; business_name: string; service_categories: ServiceCategory[] }) => {
    const assigned = assignedByPartner.get(p.id) ?? 0;
    const reserved = reservedByPartner.get(p.id) ?? 0;
    const conversion_rate = assigned > 0 ? Math.round((reserved / assigned) * 100) : 0;
    return {
      id: p.id,
      business_name: p.business_name ?? '-',
      service_categories: p.service_categories ?? [],
      assigned_count: assigned,
      reserved_count: reserved,
      conversion_rate,
    };
  });
  list.sort((a, b) => a.conversion_rate - b.conversion_rate);
  return list.slice(0, limit);
}
