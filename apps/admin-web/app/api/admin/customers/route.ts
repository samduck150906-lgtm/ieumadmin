/**
 * 본사: 고객 목록 + 통계 (서버 Supabase 사용, RLS 우회)
 * 관리자/스태프만 호출 가능.
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase';
import { getCustomersWithClient, getCustomerStatsWithClient } from '@/lib/api/customers';
import type { ServiceCategory } from '@/types/database';
import { withErrorHandler } from '@/lib/api/error-handler';
import { captureError } from '@/lib/monitoring';

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();
  if (session.role !== 'staff' && session.role !== 'admin') return forbiddenResponse();

  const search = request.nextUrl.searchParams.get('search') ?? undefined;
  const page = Number(request.nextUrl.searchParams.get('page')) || 1;
  const limit = Number(request.nextUrl.searchParams.get('limit')) || 20;
  const category = (request.nextUrl.searchParams.get('category') || undefined) as ServiceCategory | undefined;
  const source_type = request.nextUrl.searchParams.get('source_type') ?? undefined;

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: 'Supabase가 설정되지 않았습니다.' },
      { status: 500 }
    );
  }

  try {
    let statsError: string | null = null;
    const [listResult, stats] = await Promise.all([
      getCustomersWithClient(supabase, { search, page, limit, category, source_type }),
      getCustomerStatsWithClient(supabase).catch((e) => {
        captureError(e, { feature: 'admin-customers-stats', route: 'GET /api/admin/customers' });
        statsError = e instanceof Error ? e.message : '통계를 불러오지 못했습니다.';
        return null;
      }),
    ]);
    return NextResponse.json({
      ...listResult,
      stats: stats ?? { total: 0, bySource: {}, byCategory: {} },
      ...(statsError ? { statsError } : {}),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '고객 목록을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
