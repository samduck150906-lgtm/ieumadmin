import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * 추천 수수료 목록 + 통계 API
 * GET /api/admin/referral-commissions
 * query: page, limit, status (active|expired|all), referrerId
 */
async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) {
    return unauthorizedResponse(
      '로그인이 필요합니다. 본사 직원(staff/admin) 계정으로 로그인했는지 확인하고, 세션이 만료되었다면 다시 로그인해 주세요.'
    );
  }

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(10, parseInt(searchParams.get('limit') ?? '20', 10)));
  const referrerId = searchParams.get('referrerId');
  const statusFilter = searchParams.get('status') ?? 'all'; // active | expired | all

  try {
    // 1. 병렬 조회: 통계(RPC) + referral_pct(정책 비율)
    const [statsResult, policyResult] = await Promise.all([
      supabase.rpc('get_referral_stats', { p_realtor_id: referrerId || null }),
      supabase
        .from('realtor_revenue_share_defaults')
        .select('referral_pct, referral_duration_months')
        .order('referral_pct', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (statsResult.error) {
      console.error('referral stats rpc error:', statsResult.error.message);
    }

    const referralPct: number = Number(policyResult.data?.referral_pct ?? 5);
    const referralDurationMonths: number = Number(policyResult.data?.referral_duration_months ?? 12);

    // 2. 추천 수수료 목록 조회
    let query = supabase
      .from('commissions')
      .select(
        `
        id, realtor_id, commission_type, service_request_id,
        referred_realtor_id, amount, is_settled, settled_at, created_at,
        referrer:realtors!commissions_realtor_id_fkey (id, business_name, contact_name),
        referred:realtors!commissions_referred_realtor_id_fkey (id, business_name, contact_name, referrer_expires_at)
      `,
        { count: 'exact' }
      )
      .eq('commission_type', 'referral')
      .order('created_at', { ascending: false });

    if (referrerId) {
      query = query.eq('realtor_id', referrerId);
    }

    const from = (page - 1) * limit;
    const to = from + limit - 1;
    const { data: rows, error: listError, count } = await query.range(from, to);

    if (listError) {
      console.error('referral commissions list error:', listError.message);
      return NextResponse.json({ error: listError.message }, { status: 500 });
    }

    // 상태 필터 적용 (active/expired는 referred의 referrer_expires_at 기준)
    const now = new Date();
    let filtered = rows ?? [];
    if (statusFilter === 'active') {
      filtered = filtered.filter((row: Record<string, unknown>) => {
        const referred = Array.isArray(row.referred) ? row.referred[0] : row.referred;
        return referred?.referrer_expires_at && new Date(referred.referrer_expires_at as string) > now;
      });
    } else if (statusFilter === 'expired') {
      filtered = filtered.filter((row: Record<string, unknown>) => {
        const referred = Array.isArray(row.referred) ? row.referred[0] : row.referred;
        return !referred?.referrer_expires_at || new Date(referred.referrer_expires_at as string) <= now;
      });
    }

    const total = count ?? 0;

    // 3. 추천 관계 목록 — 추천인(referrer) 정보도 join
    const { data: referralRelations } = await supabase
      .from('realtors')
      .select(
        `id, business_name, contact_name, referrer_id, referrer_expires_at, created_at,
         referrer_info:realtors!realtors_referrer_id_fkey (id, business_name, contact_name)`
      )
      .not('referrer_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const defaultStats = {
      total_referral_amount: 0,
      settled_amount: 0,
      unsettled_amount: 0,
      this_month_amount: 0,
      active_referrals: 0,
      expired_referrals: 0,
    };

    return NextResponse.json({
      stats: statsResult.data ?? defaultStats,
      policy: {
        referralPct,
        referralDurationMonths,
      },
      data: filtered.map((row: Record<string, unknown>) => {
        const referrer = Array.isArray(row.referrer) ? row.referrer[0] : row.referrer;
        const referred = Array.isArray(row.referred) ? row.referred[0] : row.referred;
        const expiresAt = referred?.referrer_expires_at as string | null | undefined;
        return {
          id: row.id,
          amount: Number(row.amount),
          isSettled: row.is_settled,
          settledAt: row.settled_at,
          createdAt: row.created_at,
          serviceRequestId: row.service_request_id,
          referrer: referrer
            ? { id: referrer.id, businessName: referrer.business_name, contactName: referrer.contact_name }
            : null,
          referred: referred
            ? {
                id: referred.id,
                businessName: referred.business_name,
                contactName: referred.contact_name,
                expiresAt,
                isActive: expiresAt ? new Date(expiresAt) > now : false,
              }
            : null,
        };
      }),
      referralRelations: (referralRelations ?? []).map((r: Record<string, unknown>) => {
        const expiresAt = r.referrer_expires_at as string | null | undefined;
        const referrerInfo = Array.isArray(r.referrer_info) ? r.referrer_info[0] : r.referrer_info;
        return {
          id: r.id,
          businessName: r.business_name,
          contactName: r.contact_name,
          referrerId: r.referrer_id,
          referrerName: referrerInfo?.business_name ?? null,
          referrerContactName: referrerInfo?.contact_name ?? null,
          expiresAt,
          isActive: expiresAt ? new Date(expiresAt) > now : false,
          createdAt: r.created_at,
        };
      }),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    });
  } catch (e) {
    console.error('referral commissions error:', e instanceof Error ? e.message : e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '서버 오류' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
