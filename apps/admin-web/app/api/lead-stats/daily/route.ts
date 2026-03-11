import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 가망고객 DB 일별 내역 조회 (본사 전용) — 등록일자·고객명·휴대번호, 페이징 */
async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse('로그인이 필요하거나 접근 권한이 없습니다.');

  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()), 10);
  const month = parseInt(searchParams.get('month') || String(new Date().getMonth() + 1), 10);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') || '20', 10)));

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0, 23, 59, 59, 999);
  const startStr = start.toISOString();
  const endStr = end.toISOString();

  try {
    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    const from = (page - 1) * limit;
    const { data, error, count } = await supabase
      .from('realtor_prospects')
      .select('id, name, phone, created_at', { count: 'exact' })
      .gte('created_at', startStr)
      .lte('created_at', endStr)
      .order('created_at', { ascending: false })
      .range(from, from + limit - 1);

    if (error) throw error;

    const list = (data || []).map((row: { id: string; name: string; phone: string; created_at: string }) => {
      const phone = row.phone || '';
      const masked = phone.length >= 4
        ? phone.slice(0, 3) + '-****-' + phone.slice(-4)
        : '***-**-' + phone.slice(-4);
      return {
        id: row.id,
        registeredAt: row.created_at,
        name: row.name || '-',
        phone: masked,
      };
    });

    return NextResponse.json({
      data: list,
      total: count ?? 0,
      page,
      limit,
      totalPages: Math.ceil((count ?? 0) / limit),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '조회 실패' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
