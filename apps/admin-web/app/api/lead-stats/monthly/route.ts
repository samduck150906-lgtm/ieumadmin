import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 가망고객 DB 월별 집계 (본사 전용) — 년도월, 신규 가망DB, 누적 가망DB */
async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse('로그인이 필요하거나 접근 권한이 없습니다.');

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    // 12개월 쿼리를 모두 병렬 실행 (순차 실행 제거 → 응답속도 개선)
    const monthRanges = Array.from({ length: 12 }, (_, i) => {
      const m = 12 - i;
      const monthStart = new Date(year, m - 1, 1);
      const monthEnd = new Date(year, m, 0, 23, 59, 59, 999);
      return { m, startStr: monthStart.toISOString(), endStr: monthEnd.toISOString() };
    });

    const results = await Promise.all(
      monthRanges.map(({ startStr, endStr }) =>
        Promise.all([
          supabase
            .from('realtor_prospects')
            .select('*', { count: 'exact', head: true })
            .gte('created_at', startStr)
            .lte('created_at', endStr),
          supabase
            .from('realtor_prospects')
            .select('*', { count: 'exact', head: true })
            .lte('created_at', endStr),
        ])
      )
    );

    const rows = monthRanges.map(({ m }, idx) => {
      const [{ count: newCount }, { count: cumulativeCount }] = results[idx];
      return {
        yearMonth: `${year}년 ${String(m).padStart(2, '0')}월`,
        newCount: newCount ?? 0,
        cumulativeCount: cumulativeCount ?? 0,
      };
    });

    return NextResponse.json({ data: rows });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
