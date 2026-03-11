/**
 * 대시보드 통계 API (서버 전용)
 * 브라우저 Supabase 대신 createServerClient(service role) 사용하여 RLS 제한 없이 데이터 조회
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';
import {
  getDashboardStats,
  getRecentRequests,
  getCancelledAndComplaintRequests,
  getPartnersByRatingOrComplaints,
  getPartnersByConversionRate,
} from '@/lib/api/dashboard';
import type { DashboardDateFilter } from '@/types/database';

export const dynamic = 'force-dynamic';

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const dateFilter = (searchParams.get('dateFilter') as DashboardDateFilter) || 'this_month';
  const mode = searchParams.get('mode'); // 'stats' | 'today' | 'yesterday' | 'recent' | 'cancelled' | 'rating' | 'conversion'

  try {
    if (mode === 'stats') {
      const stats = await getDashboardStats({ dateFilter });
      return NextResponse.json(stats);
    }
    if (mode === 'today') {
      const stats = await getDashboardStats({ dateFilter: 'today' });
      return NextResponse.json({ thisMonthRequests: stats.thisMonthRequests });
    }
    if (mode === 'yesterday') {
      const stats = await getDashboardStats({ dateFilter: 'yesterday' });
      return NextResponse.json({ thisMonthRequests: stats.thisMonthRequests });
    }
    if (mode === 'recent') {
      const data = await getRecentRequests(5);
      return NextResponse.json(data);
    }
    if (mode === 'cancelled') {
      const data = await getCancelledAndComplaintRequests(15);
      return NextResponse.json(data);
    }
    if (mode === 'rating') {
      const data = await getPartnersByRatingOrComplaints(10);
      return NextResponse.json(data);
    }
    if (mode === 'conversion') {
      const data = await getPartnersByConversionRate(10);
      return NextResponse.json(data);
    }

    // 기본: 전체 대시보드 데이터 한 번에
    const [
      statsData,
      todayStats,
      yesterdayStats,
      requestsData,
      cancelledData,
      ratingData,
      conversionData,
    ] = await Promise.all([
      getDashboardStats({ dateFilter }),
      getDashboardStats({ dateFilter: 'today' }),
      getDashboardStats({ dateFilter: 'yesterday' }),
      getRecentRequests(5),
      getCancelledAndComplaintRequests(15),
      getPartnersByRatingOrComplaints(10),
      getPartnersByConversionRate(10),
    ]);

    return NextResponse.json({
      stats: statsData,
      todayNewCount: todayStats.thisMonthRequests ?? 0,
      yesterdayNewCount: yesterdayStats.thisMonthRequests ?? 0,
      recentRequests: requestsData || [],
      cancelledOrComplaintList: cancelledData || [],
      partnersByRating: ratingData || [],
      partnersByConversion: conversionData || [],
    });
  } catch (error) {
    console.error('dashboard-stats error', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '대시보드 데이터 조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
