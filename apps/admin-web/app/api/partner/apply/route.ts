/**
 * 협력업체 신청 API (비로그인 접근 가능)
 * partner_applications 테이블에 status: 'pending'으로 저장 → 관리자 어드민 /partner-applications에서 승인 대기로 표시
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

function sanitize(value: unknown, maxLen = 500): string {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}

function buildPayload(body: Record<string, unknown>) {
  const categories = Array.isArray(body.service_categories)
    ? body.service_categories
    : body.category
      ? [body.category]
      : [];
  const normalizeCategory = (cat: string) =>
    cat === 'appliance_rental' || cat === 'kiosk' ? 'etc' : cat;
  const firstCategory = normalizeCategory(categories[0] ?? 'etc');
  return {
    business_name: sanitize(body.business_name, 200),
    business_number: sanitize(body.business_number, 50),
    representative_name: sanitize(body.representative_name, 100),
    address: sanitize(body.address, 500),
    manager_name: sanitize(body.manager_name, 100),
    manager_phone: sanitize(body.manager_phone, 20).replace(/-/g, ''),
    manager_email: sanitize(body.manager_email ?? body.email, 200),
    service_categories: categories as string[],
    introduction: sanitize(body.introduction, 2000),
    category: firstCategory,
    service_realtor: Boolean(body.service_realtor ?? categories.includes('realtor')),
    service_moving: Boolean(body.service_moving ?? categories.includes('moving')),
    service_cleaning: Boolean(body.service_cleaning ?? categories.includes('cleaning')),
    service_internet: Boolean(body.service_internet ?? categories.includes('internet')),
    service_interior: Boolean(body.service_interior ?? categories.includes('interior')),
    service_etc: Boolean(
      body.service_etc ??
        (categories.includes('etc') ||
          categories.includes('appliance_rental') ||
          categories.includes('kiosk'))
    ),
  };
}

export async function POST(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { success: false, error: '서비스 설정이 완료되지 않았습니다.' },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const payload = buildPayload(body);

    if (
      !payload.business_name ||
      !payload.manager_name?.trim() ||
      !payload.manager_phone ||
      !payload.manager_email?.trim()
    ) {
      return NextResponse.json(
        { success: false, error: '업체명, 담당자명, 연락처, 이메일을 모두 입력해주세요.' },
        { status: 400 }
      );
    }
    if (!payload.service_categories?.length) {
      return NextResponse.json(
        { success: false, error: '희망 업종을 1개 이상 선택해주세요.' },
        { status: 400 }
      );
    }

    const insertRow = {
      category: payload.category,
      business_name: payload.business_name,
      business_number: payload.business_number || null,
      address: payload.address || null,
      representative_name: payload.representative_name || null,
      manager_name: payload.manager_name,
      manager_phone: payload.manager_phone,
      email: payload.manager_email || null,
      introduction: payload.introduction || null,
      business_license_url: null as string | null,
      status: 'pending',
      service_categories: payload.service_categories,
      service_realtor: payload.service_realtor,
      service_moving: payload.service_moving,
      service_cleaning: payload.service_cleaning,
      service_internet: payload.service_internet,
      service_interior: payload.service_interior,
      service_etc: payload.service_etc,
    };

    const { data, error } = await supabase
      .from('partner_applications')
      .insert(insertRow)
      .select('id')
      .single();

    if (error) {
      console.error('[협력업체 신청] insert:', error);
      return NextResponse.json(
        { success: false, error: '신청 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    void supabase.from('notification_logs').insert({
      notification_type: 'partner_application_received',
      channel: 'web',
      recipient_name: payload.manager_name || null,
      recipient_phone: payload.manager_phone || null,
      message_content: JSON.stringify({
        business_name: payload.business_name,
        category: payload.category,
        application_id: data?.id,
      }),
      is_sent: true,
    });

    return NextResponse.json({ success: true, applicationId: data?.id ?? null });
  } catch (err) {
    console.error('[협력업체 신청 실패]:', err);
    return NextResponse.json(
      { success: false, error: '신청 처리 중 오류가 발생했습니다.' },
      { status: 500 }
    );
  }
}
