import { NextRequest, NextResponse } from 'next/server';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { VALID_SERVICE_IDS } from '@ieum/shared';

/** 고객 폼메일 → 관리자 DB 자동 연동 API
 * 외부 폼(Google Form, Typeform 등)에서 Zapier/Make로 전달하거나,
 * 관리자가 수동으로 폼 데이터를 DB에 등록할 때 사용
 */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || !['admin', 'staff'].includes(session.role)) {
    return unauthorizedResponse();
  }

  try {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const name = String(body.name ?? '').trim();
    const phone = String(body.phone ?? '').replace(/[^0-9]/g, '');
    const services = Array.isArray(body.services)
      ? (body.services as string[]).filter((s) => (VALID_SERVICE_IDS as readonly string[]).includes(s))
      : body.service
        ? [String(body.service)].filter((s) => (VALID_SERVICE_IDS as readonly string[]).includes(s))
        : [];

    if (!name || name.length < 1) {
      return NextResponse.json({ success: false, error: '이름을 입력해주세요.' }, { status: 400 });
    }
    if (!phone || !/^01[016789]\d{7,8}$/.test(phone)) {
      return NextResponse.json({ success: false, error: '올바른 연락처를 입력해주세요.' }, { status: 400 });
    }
    if (services.length === 0) {
      return NextResponse.json({ success: false, error: '최소 1개 서비스를 선택해주세요.' }, { status: 400 });
    }

    const moving_date = body.moving_date ?? body.movingDate ?? null;
    const moving_address = String(body.moving_address ?? body.movingAddress ?? '').trim() || null;
    const current_address = String(body.current_address ?? body.from_address ?? '').trim() || null;
    const area_size = body.area_size ?? body.areaSize ?? null;
    const area_pyeong_exact = body.area_pyeong_exact != null ? parseFloat(String(body.area_pyeong_exact)) : null;
    const moving_type = body.moving_type ?? body.movingType ?? null;
    const source_realtor_id = body.source_realtor_id ?? null;
    const memo = String(body.memo ?? '').trim() || null;
    const source_type = 'formmail_import';

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: '서버 설정 오류' }, { status: 503 });
    }

    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        name,
        phone,
        moving_date: moving_date || null,
        moving_address: moving_address || '',
        current_address,
        area_size: area_size || null,
        area_pyeong_exact: area_pyeong_exact != null && !isNaN(area_pyeong_exact) && area_pyeong_exact > 0 ? area_pyeong_exact : null,
        moving_type: moving_type || null,
        source_realtor_id: source_realtor_id || null,
        source_type,
        memo,
      })
      .select('id')
      .single();

    if (customerError) {
      console.error('[import-customer] customers insert:', customerError);
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
      console.error('[import-customer] service_requests insert:', requestError);
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
    console.error('[import-customer]', e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '처리 중 오류' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  return postHandler(request);
}
