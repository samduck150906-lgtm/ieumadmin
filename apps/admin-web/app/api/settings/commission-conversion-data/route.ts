import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * 수수료 전환표 페이지용 데이터 (서버 Supabase 사용 — 클라이언트 세션/RLS 이슈 회피)
 * GET /api/settings/commission-conversion-data
 */
async function getHandler(_request: NextRequest) {
  const session = await verifyStaffSession(_request);
  if (!session) {
    return unauthorizedResponse(
      '로그인이 필요합니다. 본사 직원(staff/admin) 계정으로 로그인해 주세요.'
    );
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  try {
    const [movingRes, cleaningRes, internetRes, revenueRes] = await Promise.all([
      supabase
        .from('db_price_moving')
        .select('*')
        .order('area_size')
        .order('moving_type'),
      supabase
        .from('db_price_cleaning')
        .select('*')
        .limit(1)
        .maybeSingle(),
      supabase
        .from('db_price_internet')
        .select('*')
        .order('internet_type'),
      supabase
        .from('realtor_revenue_share_defaults')
        .select('*')
        .order('category'),
    ]);

    if (movingRes.error) {
      return NextResponse.json(
        { error: `이사 가격 조회 실패: ${movingRes.error.message}` },
        { status: 500 }
      );
    }
    if (internetRes.error) {
      return NextResponse.json(
        { error: `인터넷 가격 조회 실패: ${internetRes.error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      moving: movingRes.data ?? [],
      cleaning: cleaningRes.data ?? null,
      internet: internetRes.data ?? [],
      revenueShareDefaults: revenueRes.data ?? [],
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : '데이터 조회 중 오류가 발생했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
