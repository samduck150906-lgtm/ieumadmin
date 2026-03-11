/**
 * 제휴업체 대시보드 통계: 미수금, 관심DB 매칭, 당월완료, 전환률
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

async function getHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const session = await verifyPartnerSession(request);
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });
  const partnerId = session.partnerId;
  // realtor는 partner 테이블 미사용 → 빈 통계 반환 (401 대신 정상 응답)
  if (!partnerId) {
    return NextResponse.json({
      receivableTotal: 0,
      thisMonthReceivableTotal: 0,
      lastMonthReceivableTotal: 0,
      receivableList: [],
      interestMatchCount: 0,
      monthlyCompletedCount: 0,
      monthlyCompletedAmount: 0,
      lastMonthCompletedAmount: 0,
      assignedConversionRate: 0,
      purchasedConversionRate: 0,
      lastMonthAssignedConversionRate: 0,
      pipelineCounts: {},
      totalPipeline: 0,
      mileageBalance: 0,
      mileageTotalEarned: 0,
    });
  }

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
  const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
  const thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const lastMonthStartDate = lastMonthStart.split('T')[0];
  const lastMonthEndDate = lastMonthEnd.split('T')[0];
  const thisMonthStartDate = thisMonthStart.split('T')[0];

  const statusList = ['unread', 'read', 'consulting', 'visiting', 'reserved', 'absent', 'cancelled', 'completed', 'pending'] as const;

  // 1~5번 쿼리 병렬 실행 (미수금, 완료, 전환률, pipeline, 마일리지)
  const [
    recvResult,
    lastMonthRecvResult,
    thisMonthRecvResult,
    completedResult,
    lastMonthCompletedResult,
    totalAssignedResult,
    convertedAssignedResult,
    paidRowsResult,
    lastMonthTotalAssignedResult,
    lastMonthConvertedAssignedResult,
    ...pipelineResults
  ] = await Promise.all([
    // 1. 미수금
    supabase.from('partner_receivables').select('id, amount, service_request_id, receivable_month').eq('partner_id', partnerId).eq('is_paid', false),
    supabase.from('partner_receivables').select('amount').eq('partner_id', partnerId).gte('receivable_month', lastMonthStartDate).lte('receivable_month', lastMonthEndDate),
    supabase.from('partner_receivables').select('amount').eq('partner_id', partnerId).gte('receivable_month', thisMonthStartDate).lte('receivable_month', thisMonthEnd),
    // 2. 당월/전월 완료
    supabase.from('partner_assignments').select('id, db_completion_price, completed_at').eq('partner_id', partnerId).eq('status', 'completed').gte('completed_at', thisMonthStart),
    supabase.from('partner_assignments').select('db_completion_price').eq('partner_id', partnerId).eq('status', 'completed').gte('completed_at', lastMonthStart).lte('completed_at', lastMonthEnd),
    // 3. 전환률
    supabase.from('partner_assignments').select('*', { count: 'exact', head: true }).eq('partner_id', partnerId).not('status', 'eq', 'cancelled'),
    supabase.from('partner_assignments').select('*', { count: 'exact', head: true }).eq('partner_id', partnerId).in('status', ['reserved', 'completed']),
    supabase.from('db_view_payments').select('service_request_id').eq('partner_id', partnerId),
    supabase.from('partner_assignments').select('*', { count: 'exact', head: true }).eq('partner_id', partnerId).not('status', 'eq', 'cancelled').gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
    supabase.from('partner_assignments').select('*', { count: 'exact', head: true }).eq('partner_id', partnerId).in('status', ['reserved', 'completed']).gte('created_at', lastMonthStart).lte('created_at', lastMonthEnd),
    // 4. pipeline 상태별 카운트
    ...statusList.map((st) =>
      supabase.from('partner_assignments').select('*', { count: 'exact', head: true }).eq('partner_id', partnerId).eq('status', st)
    ),
    // 5. 마일리지
    supabase.from('partner_mileage_balance').select('balance, total_earned').eq('partner_id', partnerId).maybeSingle(),
  ]);

  // 1. 미수금 결과 처리
  let receivableTotal = 0;
  let thisMonthReceivableTotal = 0;
  let lastMonthReceivableTotal = 0;
  let receivableList: { id: string; amount: number; service_request_id: string }[] = [];
  try {
    const recv = recvResult.data;
    if (recv) {
      receivableTotal = recv.reduce((s, r) => s + Number(r.amount || 0), 0);
      receivableList = recv.map((r) => ({
        id: r.id,
        amount: Number(r.amount || 0),
        service_request_id: r.service_request_id,
      }));
    }
    if (lastMonthRecvResult.data) {
      lastMonthReceivableTotal = lastMonthRecvResult.data.reduce((s, r) => s + Number(r.amount || 0), 0);
    }
    if (thisMonthRecvResult.data) {
      thisMonthReceivableTotal = thisMonthRecvResult.data.reduce((s, r) => s + Number(r.amount || 0), 0);
    }
  } catch {
    // 테이블 미존재 시 무시
  }

  // 2. 당월 완료
  let monthlyCompletedCount = 0;
  let monthlyCompletedAmount = 0;
  let lastMonthCompletedAmount = 0;
  const completed = completedResult.data;
  if (completed) {
    monthlyCompletedCount = completed.length;
    monthlyCompletedAmount = completed.reduce((s, r) => s + Number(r.db_completion_price || 0), 0);
  }
  if (lastMonthCompletedResult.data) {
    lastMonthCompletedAmount = lastMonthCompletedResult.data.reduce((s, r) => s + Number(r.db_completion_price || 0), 0);
  }

  // 3. 전환률
  let assignedConversionRate = 0;
  let purchasedConversionRate = 0;
  let lastMonthAssignedConversionRate = 0;
  const totalAssigned = totalAssignedResult.count;
  const convertedAssigned = convertedAssignedResult.count;
  if ((totalAssigned ?? 0) > 0) {
    assignedConversionRate = Math.round(((convertedAssigned ?? 0) / (totalAssigned ?? 1)) * 100);
  }
  const paidRows = paidRowsResult.data;
  const paidIds = new Set((paidRows || []).map((r: { service_request_id: string }) => r.service_request_id));
  const { data: purchasedAssignments } = await supabase
    .from('partner_assignments')
    .select('status')
    .eq('partner_id', partnerId)
    .in('service_request_id', Array.from(paidIds));
  const totalPurchased = paidIds.size;
  const convertedPurchased = (purchasedAssignments || []).filter((a) =>
    ['reserved', 'completed'].includes(a.status)
  ).length;
  if (totalPurchased > 0) {
    purchasedConversionRate = Math.round((convertedPurchased / totalPurchased) * 100);
  }
  const lastMonthTotalAssigned = lastMonthTotalAssignedResult.count;
  const lastMonthConvertedAssigned = lastMonthConvertedAssignedResult.count;
  if ((lastMonthTotalAssigned ?? 0) > 0) {
    lastMonthAssignedConversionRate = Math.round(
      ((lastMonthConvertedAssigned ?? 0) / (lastMonthTotalAssigned ?? 1)) * 100
    );
  }

  // 4. pipeline
  const pipelineCounts: Record<string, number> = {};
  try {
    statusList.forEach((st, i) => {
      const res = pipelineResults[i] as { count?: number };
      pipelineCounts[st] = res?.count ?? 0;
    });
  } catch {
    statusList.forEach((st) => { pipelineCounts[st] = 0; });
  }
  const totalPipeline = Object.values(pipelineCounts).reduce((a, b) => a + b, 0);

  // 5. 마일리지 (Promise.all 마지막 항목)
  let mileageBalance = 0;
  let mileageTotalEarned = 0;
  try {
    const mbResult = pipelineResults[statusList.length] as { data: { balance?: number; total_earned?: number } | null };
    const mbData = mbResult?.data;
    if (mbData) {
      mileageBalance = mbData.balance ?? 0;
      mileageTotalEarned = mbData.total_earned ?? 0;
    }
  } catch {
    // 테이블 미존재 시 무시
  }

  // 6. 관심DB 매칭 수 (partner_interest_keywords + 미배정 DB)
  let interestMatchCount = 0;
  try {
    const { data: interests } = await supabase
      .from('partner_interest_keywords')
      .select('category, region_keyword, area_size, date_from, date_to')
      .eq('partner_id', partnerId);
    if (interests && interests.length > 0) {
      const { data: partner } = await supabase
        .from('partners')
        .select('service_categories')
        .eq('id', partnerId)
        .single();
      const categories = (partner?.service_categories as string[]) || [];
      const { data: unassigned } = await supabase
        .from('service_requests')
        .select(`
          id, category,
          customer:customers(current_address, moving_address, moving_date, area_size)
        `)
        .is('assigned_partner_id', null)
        .in('category', categories.length ? categories : ['moving', 'cleaning', 'internet_tv']);
      for (const sr of unassigned || []) {
        const cust = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
        const addr = cust?.current_address || cust?.moving_address || '';
        const movingDate = cust?.moving_date ? new Date(cust.moving_date) : null;
        for (const kw of interests) {
          if (kw.category !== sr.category) continue;
          let match = true;
          if (kw.region_keyword && !addr.includes(kw.region_keyword)) match = false;
          if (kw.area_size && cust?.area_size !== kw.area_size) match = false;
          if (kw.date_from && movingDate && movingDate < new Date(kw.date_from)) match = false;
          if (kw.date_to && movingDate && movingDate > new Date(kw.date_to)) match = false;
          if (match) {
            interestMatchCount++;
            break;
          }
        }
      }
    }
  } catch {
    // 테이블 미존재 시 0
  }

  return NextResponse.json({
    receivableTotal,
    thisMonthReceivableTotal,
    lastMonthReceivableTotal,
    receivableList,
    interestMatchCount,
    monthlyCompletedCount,
    monthlyCompletedAmount,
    lastMonthCompletedAmount,
    assignedConversionRate,
    purchasedConversionRate,
    lastMonthAssignedConversionRate,
    pipelineCounts,
    totalPipeline,
    mileageBalance,
    mileageTotalEarned,
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
