import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendNotification } from '@/lib/notification-service';
import { SERVICE_CATEGORY_LABELS } from '@/types/database';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

/** 배정 완료 후 고객·제휴업체 알림 발송 (알림톡 실발송: 알리고·카카오) */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  try {
    const body = await request.json().catch(() => ({}));
    const { serviceRequestId } = body as { serviceRequestId?: string };
    if (!serviceRequestId) {
      return NextResponse.json({ error: 'serviceRequestId 필요' }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase 미설정' }, { status: 500 });
    }

    const { data: sr, error } = await supabase
      .from('service_requests')
      .select(`
        id, category, assigned_partner_id,
        customer:customers!service_requests_customer_id_fkey (id, name, phone, moving_date, current_address, moving_address),
        assigned_partner:partners!service_requests_assigned_partner_id_fkey (business_name, manager_name, manager_phone, contact_phone)
      `)
      .eq('id', serviceRequestId)
      .single();

    if (error || !sr || !sr.assigned_partner_id) {
      return NextResponse.json({ error: '배정된 요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
    const partner = Array.isArray(sr.assigned_partner) ? sr.assigned_partner[0] : sr.assigned_partner;
    const customerPhone = customer?.phone;
    const partnerPhone = partner?.manager_phone || partner?.contact_phone;
    const categoryLabel = SERVICE_CATEGORY_LABELS[sr.category as keyof typeof SERVICE_CATEGORY_LABELS] || sr.category;
    const address = customer?.moving_address || customer?.current_address || '미정';

    if (customerPhone) {
      await sendNotification({
        templateKey: 'CUSTOMER_PARTNER_ASSIGNED',
        recipientPhone: customerPhone,
        recipientName: customer?.name || '고객',
        variables: {
          category: categoryLabel,
          partnerName: partner?.business_name || '',
          managerName: partner?.manager_name || '',
          managerPhone: partner?.manager_phone || partner?.contact_phone || '',
        },
        serviceRequestId,
        eventKey: `assignment:customer:${serviceRequestId}`,
        recipientId: customer?.id,
      });
    }
    if (partnerPhone) {
      await sendNotification({
        templateKey: 'PARTNER_NEW_ASSIGNMENT',
        recipientPhone: partnerPhone,
        recipientName: partner?.business_name || '제휴업체',
        variables: {
          customerName: customer?.name || '고객',
          customerPhone: customerPhone || '',
          category: categoryLabel,
          movingDate: customer?.moving_date || '미정',
          address,
        },
        serviceRequestId,
        eventKey: `assignment:partner:${serviceRequestId}`,
      });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '발송 오류' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
