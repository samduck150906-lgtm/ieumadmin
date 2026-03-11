import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/** 지난 6개월 월별 매출 차트 데이터 (payments + db_view_payments) */
export interface RevenueChartItem {
  period: string;
  revenue: number;
  settlement: number;
  commission: number;
}

/** 정산 상태별 도넛 차트 데이터 */
export interface SettlementDonutItem {
  name: string;
  value: number;
}

const STATUS_LABELS: Record<string, string> = {
  requested: '대기',
  approved: '처리중',
  completed: '완료',
  rejected: '실패',
};

function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const months = getLast6Months();
  const monthStart = months[0] + '-01T00:00:00.000Z';
  const lastMonth = months[months.length - 1];
  const monthEnd = new Date(
    parseInt(lastMonth.slice(0, 4), 10),
    parseInt(lastMonth.slice(5, 7), 10),
    0,
    23,
    59,
    59,
    999
  ).toISOString();

  try {
    const [paymentsRes, dbViewRes, withdrawalsRes, statusCountsRes] = await Promise.all([
      supabase
        .from('payments')
        .select('amount, created_at')
        .eq('status', 'completed')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),
      supabase
        .from('db_view_payments')
        .select('amount, paid_at')
        .gte('paid_at', monthStart)
        .lte('paid_at', monthEnd),
      supabase
        .from('withdrawal_requests')
        .select('amount, status, created_at')
        .eq('status', 'completed')
        .gte('created_at', monthStart)
        .lte('created_at', monthEnd),
      supabase
        .from('withdrawal_requests')
        .select('status'),
    ]);

    const revenueByMonth: Record<string, number> = {};
    months.forEach((m) => (revenueByMonth[m] = 0));

    (paymentsRes.data ?? []).forEach((p: { amount: number; created_at: string }) => {
      const key = p.created_at.slice(0, 7);
      if (revenueByMonth[key] !== undefined) {
        revenueByMonth[key] += Number(p.amount ?? 0);
      }
    });

    (dbViewRes.data ?? []).forEach((d: { amount: number; paid_at: string }) => {
      const key = d.paid_at?.slice(0, 7) ?? '';
      if (revenueByMonth[key] !== undefined) {
        revenueByMonth[key] += Number(d.amount ?? 0);
      }
    });

    const settlementByMonth: Record<string, number> = {};
    months.forEach((m) => (settlementByMonth[m] = 0));

    (withdrawalsRes.data ?? []).forEach((w: { amount: number; created_at: string }) => {
      const key = w.created_at.slice(0, 7);
      if (settlementByMonth[key] !== undefined) {
        settlementByMonth[key] += Number(w.amount ?? 0);
      }
    });

    const revenueChartData: RevenueChartItem[] = months.map((period) => {
      const revenue = revenueByMonth[period] ?? 0;
      const settlement = settlementByMonth[period] ?? 0;
      const commission = Math.max(0, revenue - settlement);
      return { period, revenue, settlement, commission };
    });

    const statusCounts: Record<string, number> = {};
    (statusCountsRes.data ?? []).forEach((r: { status: string }) => {
      const s = r.status ?? 'requested';
      statusCounts[s] = (statusCounts[s] ?? 0) + 1;
    });

    const settlementDonutData: SettlementDonutItem[] = ['requested', 'approved', 'completed', 'rejected'].map(
      (status) => ({
        name: STATUS_LABELS[status] ?? status,
        value: statusCounts[status] ?? 0,
      })
    );

    return NextResponse.json({
      revenueChart: revenueChartData,
      settlementDonut: settlementDonutData,
    });
  } catch (error) {
    console.error('dashboard-charts error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '차트 데이터 조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
