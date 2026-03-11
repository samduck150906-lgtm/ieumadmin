/**
 * 월간 추천수익 리더보드 (Top 10)
 * 공인중개사 앱/관리자에서 호출. 로그인한 realtor 또는 staff/admin만 조회 가능.
 * 비공개 API: 인증 필수 + rate limiting 적용.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
};
const endOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString();
};

async function getHandler(request: NextRequest) {
  const rate = checkRateLimit(request);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
      {
        status: 429,
        headers: rate.retryAfter
          ? { 'Retry-After': String(rate.retryAfter) }
          : undefined,
      }
    );
  }

  const session = await verifySession(request);
  if (!session) return unauthorizedResponse();
  // realtor 또는 staff/admin만 허용 (partner는 미허용)
  if (session.role !== 'realtor' && session.role !== 'staff' && session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const start = startOfMonth();
  const end = endOfMonth();

  const { data: commissions } = await supabase
    .from('commissions')
    .select('realtor_id, amount')
    .eq('commission_type', 'referral')
    .gte('created_at', start)
    .lte('created_at', end);

  const byRealtor: Record<string, number> = {};
  for (const c of commissions || []) {
    const rid = c.realtor_id;
    if (rid) byRealtor[rid] = (byRealtor[rid] || 0) + Number(c.amount || 0);
  }

  const topIds = Object.entries(byRealtor)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id]) => id);

  if (topIds.length === 0) {
    return NextResponse.json({ data: [], month: new Date().toISOString().slice(0, 7) });
  }

  const { data: realtors } = await supabase
    .from('realtors')
    .select('id, business_name')
    .in('id', topIds);

  const realtorMap: Record<string, string> = {};
  for (const r of realtors || []) {
    realtorMap[r.id] = r.business_name || '알 수 없음';
  }

  const leaderboard = topIds.map((id, i) => ({
    rank: i + 1,
    realtor_id: id,
    business_name: realtorMap[id] || '-',
    amount: byRealtor[id] || 0,
  }));

  return NextResponse.json({
    data: leaderboard,
    month: new Date().toISOString().slice(0, 7),
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
