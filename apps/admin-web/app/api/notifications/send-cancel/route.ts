/**
 * 취소 알림 발송 API
 * - 서비스 요청 취소 시 고객에게 알림톡/SMS 발송
 * - 본사 직원 인증 필요
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendNotification } from '@/lib/notification-service';
import { SERVICE_CATEGORY_LABELS } from '@/types/database';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

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
        id, category,
        customer:customers!service_requests_customer_id_fkey (id, name, phone)
      `)
      .eq('id', serviceRequestId)
      .single();

    if (error || !sr) {
      return NextResponse.json({ error: '요청을 찾을 수 없습니다.' }, { status: 404 });
    }

    const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
    if (!customer?.phone) {
      return NextResponse.json({ error: '고객 연락처가 없습니다.' }, { status: 400 });
    }

    const categoryLabel = SERVICE_CATEGORY_LABELS[sr.category as keyof typeof SERVICE_CATEGORY_LABELS] || sr.category;

    const result = await sendNotification({
      templateKey: 'CUSTOMER_CANCELLED',
      recipientPhone: customer.phone,
      recipientName: customer.name || '고객',
      variables: {
        cancelledItems: categoryLabel,
      },
      serviceRequestId,
      eventKey: `cancel:${serviceRequestId}`,
      recipientId: customer.id,
    });

    return NextResponse.json({ success: result.success });
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '발송 오류' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
