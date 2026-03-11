import { NextRequest, NextResponse } from 'next/server';
import { createServerClientOrThrow, getServerClientErrorHint } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

export interface MonthlyStats {
  yearMonth: string;
  newRequests: number;
  completedRequests: number;
  settlementAmount: number;
  newPartners: number;
  newRealtors: number;
}

export interface SummaryStats {
  totalPartners: number;
  totalRealtors: number;
  totalRequests: number;
  completedRequests: number;
  totalSettlement: number;
  pendingWithdrawals: number;
  avgConversionRate: number;
}

export interface ReportsResponse {
  summary: SummaryStats;
  monthlyStats: MonthlyStats[];
}

/** 리포트 데이터 — staff/admin 권한만 조회 가능 */
async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  let supabase;
  try {
    supabase = createServerClientOrThrow();
  } catch (e) {
    const hint = e instanceof Error ? e.message : getServerClientErrorHint();
    return NextResponse.json({ error: hint }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const year = Math.min(9999, Math.max(2000, parseInt(searchParams.get('year') ?? String(new Date().getFullYear()), 10)));

  const yearStart = `${year}-01-01T00:00:00.000Z`;
  const yearEnd = `${year}-12-31T23:59:59.999Z`;

  try {
    const [
      totalPartnersRes,
      totalRealtorsRes,
      totalRequestsRes,
      completedRes,
      settlementRes,
      pendingWithdrawalsRes,
    ] = await Promise.all([
      supabase.from('partners').select('*', { count: 'exact', head: true }),
      supabase.from('realtors').select('*', { count: 'exact', head: true }),
      supabase
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yearStart)
        .lte('created_at', yearEnd),
      supabase
        .from('service_requests')
        .select('*', { count: 'exact', head: true })
        .eq('hq_status', 'settlement_done')
        .gte('created_at', yearStart)
        .lte('created_at', yearEnd),
      supabase
        .from('withdrawal_requests')
        .select('amount')
        .eq('status', 'completed')
        .gte('created_at', yearStart)
        .lte('created_at', yearEnd),
      supabase
        .from('withdrawal_requests')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'requested'),
    ]);

    const totalReqs = totalRequestsRes.count ?? 0;
    const completedReqs = completedRes.count ?? 0;

    const summary: SummaryStats = {
      totalPartners: totalPartnersRes.count ?? 0,
      totalRealtors: totalRealtorsRes.count ?? 0,
      totalRequests: totalReqs,
      completedRequests: completedReqs,
      totalSettlement: (settlementRes.data ?? []).reduce((s, w) => s + Number(w.amount ?? 0), 0),
      pendingWithdrawals: pendingWithdrawalsRes.count ?? 0,
      avgConversionRate: totalReqs > 0 ? Math.round((completedReqs / totalReqs) * 100) : 0,
    };

    const monthlyStats: MonthlyStats[] = await Promise.all(
      Array.from({ length: 12 }, async (_, i) => {
        const m = i + 1;
        const mStart = new Date(year, m - 1, 1).toISOString();
        const mEnd = new Date(year, m, 0, 23, 59, 59, 999).toISOString();
        const [newReqsRes, completedReqsRes, settlAmtRes, newPartnersRes, newRealtorsRes] = await Promise.all([
          supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', mStart)
            .lte('created_at', mEnd),
          supabase
            .from('service_requests')
            .select('*', { count: 'exact', head: true })
            .eq('hq_status', 'settlement_done')
            .gte('created_at', mStart)
            .lte('created_at', mEnd),
          supabase
            .from('withdrawal_requests')
            .select('amount')
            .eq('status', 'completed')
            .gte('created_at', mStart)
            .lte('created_at', mEnd),
          supabase
            .from('partners')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', mStart)
            .lte('created_at', mEnd),
          supabase
            .from('realtors')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', mStart)
            .lte('created_at', mEnd),
        ]);
        return {
          yearMonth: `${m}월`,
          newRequests: newReqsRes.count ?? 0,
          completedRequests: completedReqsRes.count ?? 0,
          settlementAmount: (settlAmtRes.data ?? []).reduce((s, w) => s + Number(w.amount ?? 0), 0),
          newPartners: newPartnersRes.count ?? 0,
          newRealtors: newRealtorsRes.count ?? 0,
        };
      })
    );

    return NextResponse.json({ summary, monthlyStats } satisfies ReportsResponse);
  } catch (error) {
    console.error('reports API error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '리포트 조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
