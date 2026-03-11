import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyPartnerSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { logger } from '@/lib/logger';
import { withErrorHandler } from '@/lib/api/error-handler';
import {
  getDbViewPrice,
  isZeroWonPurchaseInCooldown,
} from '@/lib/api/partner-db';

interface PurchasePolicy {
  category: string;
  allow_duplicate: boolean;
  cooldown_hours: number;
  max_per_month: number;
}

/** 카테고리별 구매정책 로드 (없으면 'all' 기본값 사용) */
async function getPurchasePolicy(
  supabase: ReturnType<typeof createServerClient>,
  category: string
): Promise<Omit<PurchasePolicy, 'category'>> {
  if (!supabase) return { allow_duplicate: false, cooldown_hours: 0, max_per_month: 0 };

  // category 컬럼을 SELECT에 포함해야 find()로 구분 가능
  const { data } = await supabase
    .from('db_market_purchase_policy')
    .select('category, allow_duplicate, cooldown_hours, max_per_month')
    .in('category', [category, 'all'])
    .order('category', { ascending: true }); // 'all' < specific — specific이 우선

  const rows = (data || []) as PurchasePolicy[];
  const specific = rows.find((r) => r.category === category);
  const fallback = rows.find((r) => r.category === 'all');
  return specific ?? fallback ?? { allow_duplicate: false, cooldown_hours: 0, max_per_month: 0 };
}

/**
 * DB 열람 비용 결제 (모자이크 해제) + 배정
 *
 * ── 핵심 정책 ──
 * 1. 가격 0원 → 결제창 없이 즉시 구매 (purchase_db_with_lock RPC, 원자적)
 * 2. 가격 1원 이상 → 결제창을 통한 결제 필수 (lock → confirm RPC)
 * 3. 동시 구매 방지 → SELECT FOR UPDATE 기반 행 잠금 (배정은 반드시 1업체만)
 * 4. 0원 구매 쿨다운 → 10분 재구매 대기 (DB 독점 방지)
 */
async function postHandler(request: NextRequest) {
  try {
    const session = await verifyPartnerSession(request);
    if (!session) {
      return unauthorizedResponse('로그인이 필요합니다.');
    }
    if (session.role === 'realtor' || !session.partnerId) {
      return NextResponse.json(
        { error: '이 기능은 제휴업체(이사·청소·인터넷 등) 전용입니다. 공인중개사님은 이용하실 수 없습니다.' },
        { status: 403 }
      );
    }
    const partnerId = session.partnerId;

    const body = await request.json().catch(() => ({}));
    const serviceRequestId = body?.service_request_id as string | undefined;
    const paymentMethod = (body?.payment_method as string | undefined) || 'card';
    const useMileage = Boolean(body?.use_mileage);
    if (!serviceRequestId) {
      return NextResponse.json({ error: 'service_request_id 필요' }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
    }

    // ── 서비스 요청 조회 ─────────────────────────────────────────
    const { data: req } = await supabase
      .from('service_requests')
      .select('id, category, assigned_partner_id, customer:customers!service_requests_customer_id_fkey(area_size, area_pyeong_exact, moving_type)')
      .eq('id', serviceRequestId)
      .single();

    if (!req) {
      return NextResponse.json({ error: '해당 DB를 찾을 수 없습니다.' }, { status: 404 });
    }

    // 이미 배정된 건은 추가 결제 불필요
    if (req.assigned_partner_id === partnerId) {
      return NextResponse.json({ message: '이미 배정된 건은 결제 없이 열람 가능합니다.', unlocked: true });
    }

    // 이미 다른 업체에 배정된 건
    if (req.assigned_partner_id) {
      return NextResponse.json(
        { error: '이미 다른 업체에 배정되었습니다. 다른 DB를 선택해 주세요.' },
        { status: 409 }
      );
    }

    const category = req.category as string;
    const customer = Array.isArray(req.customer) ? req.customer[0] : req.customer;

    // 열람가 계산
    const amount = await getDbViewPrice(category as 'moving' | 'cleaning' | 'internet_tv', customer);
    if (amount < 0) {
      return NextResponse.json({ error: '열람가가 설정되지 않았습니다.' }, { status: 400 });
    }

    // ══════════════════════════════════════════════════════════════
    // 0원 구매: 결제창 없이 즉시 구매 (원자적 처리)
    // ══════════════════════════════════════════════════════════════
    if (amount === 0) {
      // 10분 쿨다운 검사 (DB 독점 방지)
      const inCooldown = await isZeroWonPurchaseInCooldown(partnerId);
      if (inCooldown) {
        return NextResponse.json(
          { error: '0원 구매는 10분에 한 번만 가능합니다. 잠시 후 다시 시도해 주세요.' },
          { status: 429 }
        );
      }

      // purchase_db_with_lock: SELECT FOR UPDATE 기반 원자적 처리
      // lock → 미배정 확인 → assign → db_view_payments 기록 → partner_assignments 생성
      // 동시에 여러 업체가 같은 DB를 구매하더라도 1업체만 배정됩니다.
      const { data: result, error: rpcError } = await supabase.rpc('purchase_db_with_lock', {
        p_service_request_id: serviceRequestId,
        p_partner_id: partnerId,
      });

      if (rpcError) {
        logger.error('[db-view-pay] purchase_db_with_lock RPC 오류', { error: rpcError.message, serviceRequestId, partnerId });
        return NextResponse.json(
          { error: rpcError.message || '구매 처리 중 오류가 발생했습니다.' },
          { status: 500 }
        );
      }

      if (!result?.success) {
        logger.error('[db-view-pay] purchase_db_with_lock 실패', { result, serviceRequestId, partnerId });
        return NextResponse.json(
          { error: result?.error || '이미 다른 업체에 배정되었습니다. 다른 DB를 선택해 주세요.' },
          { status: 409 }
        );
      }

      // payment_method를 'free'로 업데이트
      await supabase
        .from('db_view_payments')
        .update({ payment_method: 'free' })
        .eq('partner_id', partnerId)
        .eq('service_request_id', serviceRequestId);

      return NextResponse.json({
        success: true,
        amount: 0,
        originalAmount: 0,
        mileageUsed: 0,
        message: '0원 구매가 완료되었습니다.',
      });
    }

    // ══════════════════════════════════════════════════════════════
    // 1원 이상: 결제창을 통한 결제 필수
    // ══════════════════════════════════════════════════════════════

    // 구매정책 로드
    const policy = await getPurchasePolicy(supabase, category);

    // ── 정책 검사 1: 중복구매 허용 여부 ──────────────────────────
    if (!policy.allow_duplicate) {
      const { count: dupCount } = await supabase
        .from('db_view_payments')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .eq('service_request_id', serviceRequestId);
      if ((dupCount ?? 0) > 0) {
        return NextResponse.json(
          { error: '이미 구매한 DB입니다. (중복구매 불가)' },
          { status: 409 }
        );
      }
    }

    // ── 정책 검사 2: 쿨다운 ──────────────────────────────────────
    if (policy.cooldown_hours > 0) {
      const cutoff = new Date(Date.now() - policy.cooldown_hours * 60 * 60 * 1000).toISOString();
      const { count: cooldownCount } = await supabase
        .from('db_view_payments')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .gte('paid_at', cutoff);
      if ((cooldownCount ?? 0) > 0) {
        return NextResponse.json(
          { error: `쿨다운 중입니다. ${policy.cooldown_hours}시간 이후 다시 구매 가능합니다.` },
          { status: 429 }
        );
      }
    }

    // ── 정책 검사 3: 월 구매 한도 ────────────────────────────────
    if (policy.max_per_month > 0) {
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      const { count: monthCount } = await supabase
        .from('db_view_payments')
        .select('*', { count: 'exact', head: true })
        .eq('partner_id', partnerId)
        .gte('paid_at', monthStart.toISOString());
      if ((monthCount ?? 0) >= policy.max_per_month) {
        return NextResponse.json(
          { error: `이번 달 구매 한도(${policy.max_per_month}건)에 도달했습니다.` },
          { status: 429 }
        );
      }
    }

    // ── DB 잠금 획득 (SELECT FOR UPDATE — 동시 구매 방지) ────────
    // 다른 업체가 구매 진행 중이면 실패 (5분 잠금 타임아웃)
    const { data: lockResult, error: lockError } = await supabase.rpc('lock_db_for_purchase', {
      p_service_request_id: serviceRequestId,
      p_partner_id: partnerId,
    });

    if (lockError) {
      return NextResponse.json(
        { error: lockError.message || 'DB 잠금 획득에 실패했습니다.' },
        { status: 500 }
      );
    }

    if (!lockResult?.success) {
      return NextResponse.json(
        { error: lockResult?.error || '현재 다른 업체가 구매 진행 중입니다. 잠시 후 다시 시도해 주세요.' },
        { status: 409 }
      );
    }

    // 이미 배정된 건이면 결제 불필요
    if (lockResult?.already_assigned) {
      return NextResponse.json({
        message: '이미 배정된 건은 결제 없이 열람 가능합니다.',
        unlocked: true,
      });
    }

    const lockViewPrice = Number(lockResult?.view_price ?? amount);
    const lockCompletionPrice = Number(lockResult?.completion_price ?? 0);

    // ── 마일리지 처리 (잠금 획득 후 처리하여 선점 상태 보장) ────
    let finalAmount = lockViewPrice;
    let mileageUsed = 0;

    if (useMileage && lockViewPrice > 0) {
      const { data: mb } = await supabase
        .from('partner_mileage_balance')
        .select('balance')
        .eq('partner_id', partnerId)
        .maybeSingle();
      const balance = mb?.balance ?? 0;
      if (balance > 0) {
        mileageUsed = Math.min(balance, lockViewPrice);
        finalAmount = lockViewPrice - mileageUsed;

        try {
          await supabase.rpc('use_partner_mileage', {
            p_partner_id: partnerId,
            p_amount: mileageUsed,
            p_type: 'used_db_purchase',
            p_reference_id: serviceRequestId,
            p_note: `DB 열람 마일리지 차감 (요청ID: ${serviceRequestId})`,
          });
        } catch (e) {
          console.error('[db-view-pay] 마일리지 차감 실패:', e);
          await supabase.rpc('unlock_db_purchase', {
            p_service_request_id: serviceRequestId,
            p_partner_id: partnerId,
          });
          return NextResponse.json({ error: '마일리지 처리에 실패했습니다.' }, { status: 500 });
        }
      }
    }

    // ── 구매 확정 (원자적: lock 검증 → assign → payment/assignment 기록) ──
    // confirm_db_purchase: locked_by 검증 → service_requests 배정 → db_view_payments 기록
    //                      → partner_assignments 생성 (모두 하나의 트랜잭션)
    const { data: confirmResult, error: confirmError } = await supabase.rpc('confirm_db_purchase', {
      p_service_request_id: serviceRequestId,
      p_partner_id: partnerId,
      p_amount: finalAmount,
      p_view_price: lockViewPrice,
      p_completion_price: lockCompletionPrice,
    });

    if (confirmError || !confirmResult?.success) {
      // 구매 확정 실패 시 잠금 해제
      await supabase.rpc('unlock_db_purchase', {
        p_service_request_id: serviceRequestId,
        p_partner_id: partnerId,
      });
      return NextResponse.json(
        { error: confirmResult?.error || confirmError?.message || '구매 확정에 실패했습니다.' },
        { status: 409 }
      );
    }

    // ── payment_method 업데이트 ──────────────────────────────────
    const effectiveMethod = mileageUsed >= lockViewPrice ? 'mileage' : paymentMethod;
    await supabase
      .from('db_view_payments')
      .update({ payment_method: effectiveMethod })
      .eq('partner_id', partnerId)
      .eq('service_request_id', serviceRequestId);

    return NextResponse.json({
      success: true,
      amount: finalAmount,
      originalAmount: lockViewPrice,
      mileageUsed,
      message: '결제가 완료되었습니다.',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : '결제 기록 실패' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
