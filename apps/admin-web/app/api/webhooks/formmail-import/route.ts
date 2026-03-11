/**
 * 고객 폼메일 → 관리자 DB 자동 연동 웹훅
 *
 * Zapier / Make / n8n 등에서 Gmail 수신, Google Form 제출 등 이벤트 시
 * 이 엔드포인트로 POST하여 customers + service_requests에 자동 등록.
 *
 * 인증: Authorization: Bearer {FORMMAIL_WEBHOOK_SECRET}
 *      또는 X-Webhook-Secret: {FORMMAIL_WEBHOOK_SECRET}
 *      (미설정 시 CRON_SECRET 사용)
 *
 * 서비스 검증: form_service_items 테이블의 활성 category_key 사용 (fallback: VALID_SERVICE_IDS)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { VALID_SERVICE_IDS } from '@ieum/shared';

export const dynamic = 'force-dynamic';

/** form_service_items에서 활성 category_key 조회 (테이블 없거나 실패 시 fallback) */
async function getValidCategoryKeys(
  supabase: NonNullable<Awaited<ReturnType<typeof createServerClient>>>
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('form_service_items')
      .select('category_key')
      .eq('is_active', true);
    if (!error && data?.length) return data.map((r: { category_key: string }) => r.category_key);
  } catch {
    /* 테이블 미적용 등 → fallback */
  }
  return [...(VALID_SERVICE_IDS as readonly string[])];
}

function getWebhookSecret(): string {
  return (
    process.env.FORMMAIL_WEBHOOK_SECRET?.trim() ||
    process.env.CRON_SECRET?.trim() ||
    ''
  );
}

function verifyWebhook(request: NextRequest): boolean {
  const secret = getWebhookSecret();
  if (!secret || secret.length < 16) return false;

  const authHeader = request.headers.get('authorization');
  const bearer = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (bearer === secret) return true;

  const headerSecret = request.headers.get('x-webhook-secret')?.trim();
  if (headerSecret === secret) return true;

  return false;
}

export async function POST(request: NextRequest) {
  if (!verifyWebhook(request)) {
    return NextResponse.json({ success: false, error: '인증 실패' }, { status: 401 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: '서버 설정 오류' }, { status: 503 });
  }

  try {
    const validKeys = await getValidCategoryKeys(supabase);
    const validSet = new Set(validKeys);

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').replace(/[^0-9]/g, '');
    const services = Array.isArray(body.services)
      ? (body.services as string[]).filter((s) => validSet.has(s))
      : body.service
        ? [String(body.service)].filter((s) => validSet.has(s))
        : [];

    if (!name || name.length < 1) {
      return NextResponse.json({ success: false, error: '이름을 입력해주세요.' }, { status: 400 });
    }
    if (!phone || !/^01[016789]\d{7,8}$/.test(phone)) {
      return NextResponse.json(
        { success: false, error: '올바른 연락처를 입력해주세요.' },
        { status: 400 }
      );
    }
    if (services.length === 0) {
      return NextResponse.json(
        { success: false, error: '최소 1개 서비스를 선택해주세요.' },
        { status: 400 }
      );
    }

    const moving_date = body.moving_date ?? body.movingDate ?? null;
    const moving_address = String(body.moving_address ?? body.movingAddress ?? '').trim() || null;
    const current_address =
      String(body.current_address ?? body.from_address ?? '').trim() || null;
    const area_size = body.area_size ?? body.areaSize ?? null;
    const area_pyeong_exact =
      body.area_pyeong_exact != null ? parseFloat(String(body.area_pyeong_exact)) : null;
    const moving_type = body.moving_type ?? body.movingType ?? null;
    const source_realtor_id = body.source_realtor_id ?? null;
    const memo = String(body.memo ?? '').trim() || null;
    const source_type = 'formmail_webhook';

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        name,
        phone,
        moving_date: moving_date || null,
        moving_address: moving_address || '',
        current_address,
        area_size: area_size || null,
        area_pyeong_exact:
          area_pyeong_exact != null &&
          !isNaN(area_pyeong_exact) &&
          area_pyeong_exact > 0
            ? area_pyeong_exact
            : null,
        moving_type: moving_type || null,
        source_realtor_id: source_realtor_id || null,
        source_type,
        memo,
      })
      .select('id')
      .single();

    if (customerError) {
      console.error('[formmail-webhook] customers insert:', customerError);
      return NextResponse.json(
        { success: false, error: customerError.message || '고객 등록 실패' },
        { status: 500 }
      );
    }

    const serviceRequests = services.map((category: string) => ({
      customer_id: customer.id,
      category,
      hq_status: 'unread' as const,
    }));

    const { error: requestError } = await supabase
      .from('service_requests')
      .insert(serviceRequests);

    if (requestError) {
      console.error('[formmail-webhook] service_requests insert:', requestError);
      await supabase.from('customers').delete().eq('id', customer.id);
      return NextResponse.json(
        { success: false, error: requestError.message || '서비스 요청 등록 실패' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      customerId: customer.id,
      message: '폼메일 데이터가 DB에 등록되었습니다.',
    });
  } catch (e) {
    console.error('[formmail-webhook]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '처리 중 오류' },
      { status: 500 }
    );
  }
}
