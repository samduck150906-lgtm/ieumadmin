/**
 * 파트너 마일리지 API
 * GET  - 잔액 + 최근 이력 조회
 * POST - 마일리지 적립(earn) / 차감(spend)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession, verifyStaffSession } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

async function getHandler(request: NextRequest) {
  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  if (!partnerId) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '30', 10)));
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  try {
    const [balanceRes, historyRes] = await Promise.all([
      supabase
        .from('partner_mileage_balance')
        .select('balance, total_earned, total_used')
        .eq('partner_id', partnerId)
        .maybeSingle(),
      supabase
        .from('partner_mileage_history')
        .select('id, amount, type, note, balance_after, created_at', { count: 'exact' })
        .eq('partner_id', partnerId)
        .order('created_at', { ascending: false })
        .range(from, to),
    ]);

    const total = historyRes.count ?? 0;

    return NextResponse.json({
      balance: balanceRes.data?.balance ?? 0,
      totalEarned: balanceRes.data?.total_earned ?? 0,
      totalUsed: balanceRes.data?.total_used ?? 0,
      history: historyRes.data || [],
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch {
    return NextResponse.json({ balance: 0, totalEarned: 0, totalUsed: 0, history: [], pagination: { total: 0, page: 1, limit: 30, totalPages: 0 } });
  }
}

async function postHandler(request: NextRequest) {
  // earn: 본사 직원만 가능 (결제 승인 시 서버 사이드에서 호출)
  // spend: 파트너 본인이 직접 차감 (DB 구매 / 미수금 결제 시)
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  let body: {
    type: 'earn' | 'spend';
    partnerId?: string;
    amount: number;
    reason?: string;
    referenceId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { type, amount, reason, referenceId } = body;

  if (!type || !['earn', 'spend'].includes(type)) {
    return NextResponse.json({ error: 'type은 earn 또는 spend여야 합니다.' }, { status: 400 });
  }

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: '금액은 0보다 커야 합니다.' }, { status: 400 });
  }

  // --- earn: 본사 직원만 ---
  if (type === 'earn') {
    const staffSession = await verifyStaffSession(request);
    if (!staffSession) {
      return NextResponse.json({ error: '본사 직원 인증이 필요합니다.' }, { status: 401 });
    }

    const partnerId = body.partnerId;
    if (!partnerId) {
      return NextResponse.json({ error: 'partnerId가 필요합니다.' }, { status: 400 });
    }

    try {
      const { data, error } = await supabase.rpc('add_partner_mileage', {
        p_partner_id: partnerId,
        p_payment_amount: amount,
        p_reference_id: referenceId ?? null,
        p_note: reason ?? `수동 적립 (${amount.toLocaleString()}원)`,
      });

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });

      const result = data as { success: boolean; reason?: string; mileage_earned?: number; balance_after?: number };

      if (!result.success) {
        return NextResponse.json({ error: result.reason ?? '적립 실패' }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        mileageEarned: result.mileage_earned,
        balanceAfter: result.balance_after,
      });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : '적립 처리 실패' }, { status: 500 });
    }
  }

  // --- spend: 파트너 본인 ---
  const partnerSession = await verifyPartnerSession(request);
  const partnerId = partnerSession?.partnerId;
  if (!partnerId) {
    return NextResponse.json({ error: '파트너 인증이 필요합니다.' }, { status: 401 });
  }

  try {
    let spendType = 'used_payment';
    if (reason?.includes('DB 구매') || reason?.includes('db_purchase')) {
      spendType = 'used_db_purchase';
    }

    const { data, error } = await supabase.rpc('use_partner_mileage', {
      p_partner_id: partnerId,
      p_amount: amount,
      p_type: spendType,
      p_reference_id: referenceId ?? null,
      p_note: reason ?? `마일리지 사용 (${amount.toLocaleString()}원)`,
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as { success: boolean; reason?: string; amount_used?: number; balance_after?: number; balance?: number };

    if (!result.success) {
      if (result.reason === 'insufficient_balance') {
        return NextResponse.json({
          error: `마일리지 잔액이 부족합니다. (현재 잔액: ${(result.balance ?? 0).toLocaleString()}원)`,
          code: 'INSUFFICIENT_BALANCE',
          balance: result.balance ?? 0,
        }, { status: 400 });
      }
      return NextResponse.json({ error: result.reason ?? '차감 실패' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      amountUsed: result.amount_used,
      balanceAfter: result.balance_after,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : '차감 처리 실패' }, { status: 500 });
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
