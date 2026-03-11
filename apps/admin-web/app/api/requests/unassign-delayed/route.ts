/**
 * 지연 DB 배정 해제 API
 * - 배정 후 24시간 경과한 DB를 미배정으로 전환
 * - 해제 전 제휴업체에게 "DB 처리 확인문자" 발송 (엑셀 요구: 구매 DB의 경우 업체에 DB 처리 확인문자 처리전까지 발송)
 */
import { NextRequest, NextResponse } from 'next/server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { createServerClient } from '@/lib/supabase-server';
import { sendNotification } from '@/lib/notification-service';
import { SERVICE_CATEGORY_LABELS } from '@/types/database';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  let body: { serviceRequestId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'serviceRequestId가 필요합니다.' }, { status: 400 });
  }
  const serviceRequestId = body?.serviceRequestId;
  if (!serviceRequestId || typeof serviceRequestId !== 'string') {
    return NextResponse.json({ error: 'serviceRequestId가 필요합니다.' }, { status: 400 });
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  // 해당 건 조회 (업체 연락처 + 고객명/카테고리)
  const { data: sr, error: fetchErr } = await supabase
    .from('service_requests')
    .select(`
      id, category, assigned_partner_id,
      customer:customers!service_requests_customer_id_fkey (name),
      assigned_partner:partners!service_requests_assigned_partner_id_fkey (business_name, manager_phone, contact_phone)
    `)
    .eq('id', serviceRequestId)
    .single();

  if (fetchErr || !sr) {
    return NextResponse.json({ error: '해당 DB를 찾을 수 없습니다.' }, { status: 404 });
  }
  if (!sr.assigned_partner_id) {
    return NextResponse.json({ error: '이미 미배정 상태입니다.' }, { status: 400 });
  }

  const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
  const partner = Array.isArray(sr.assigned_partner) ? sr.assigned_partner[0] : sr.assigned_partner;
  const partnerPhone = partner?.manager_phone || partner?.contact_phone;
  const categoryLabel = SERVICE_CATEGORY_LABELS[sr.category as keyof typeof SERVICE_CATEGORY_LABELS] ?? sr.category;

  // 1) 제휴업체에게 지연 배정 해제 안내 발송
  if (partnerPhone) {
    try {
      await sendNotification({
        templateKey: 'PARTNER_DELAYED_UNASSIGN',
        recipientPhone: partnerPhone,
        recipientName: partner?.business_name ?? '제휴업체',
        variables: {
          customerName: customer?.name ?? '고객',
          category: categoryLabel,
        },
        serviceRequestId,
      });
    } catch (notifyErr) {
      // 알림 실패해도 배정 해제는 진행
    }
  }

  // 2) 배정 해제 (partner_assignments 취소, service_requests assigned_partner_id null)
  const { error: unassignErr } = await supabase
    .from('partner_assignments')
    .update({
      status: 'cancelled',
      cancel_reason: 'other_partner',
      cancel_reason_detail: '24시간 미처리 지연 DB 배정 해제',
      updated_at: new Date().toISOString(),
    })
    .eq('service_request_id', serviceRequestId);

  if (unassignErr) {
    return NextResponse.json({ error: '배정 해제 처리 실패: ' + unassignErr.message }, { status: 500 });
  }

  const { error: clearErr } = await supabase
    .from('service_requests')
    .update({
      assigned_partner_id: null,
      assigned_at: null,
      assigned_by: null,
      hq_status: 'unread',
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceRequestId);

  if (clearErr) {
    return NextResponse.json({ error: '배정 해제 처리 실패: ' + clearErr.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
