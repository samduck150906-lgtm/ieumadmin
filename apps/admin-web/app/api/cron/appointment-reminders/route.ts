export const dynamic = 'force-dynamic';

/**
 * 일정 임박 알림톡 크론잡 API
 * - 매일 오전 9시 실행 권장
 * - 내일(D-1) 예약완료(installation_date) 건 → 고객에게 예약 확인 알림톡 + 제휴업체에게 내일 예약 알림
 * - 내일(D-1) 방문상담(visit_date) 건 → 고객에게 방문 예정 안내 문자
 *
 * 호출: GET /api/cron/appointment-reminders
 * 보안: Authorization: Bearer <CRON_SECRET> 헤더 필수
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sendNotification } from '@/lib/notification-service';
import { withErrorHandler } from '@/lib/api/error-handler';

const CRON_SECRET = process.env.CRON_SECRET;

function getKstDate(offsetDays = 0): string {
  const now = new Date();
  const kstOffsetMinutes = 9 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const kst = new Date(utcMs + kstOffsetMinutes * 60 * 1000);
  kst.setDate(kst.getDate() + offsetDays);
  return kst.toISOString().slice(0, 10);
}

async function getHandler(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: '인증 실패' }, { status: 401 });
  }

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const tomorrowStr = getKstDate(1);

  let reservationSent = 0;
  let partnerReservationSent = 0;
  let visitSent = 0;
  const errors: string[] = [];

  const CATEGORY_LABELS: Record<string, string> = {
    moving: '이사',
    cleaning: '입주청소',
    internet_tv: '인터넷·TV',
    interior: '인테리어',
    appliance_rental: '가전렌탈',
    kiosk: '키오스크',
  };

  // ── 1. 내일 예약완료(installation_date D-1) 건 ──────────────────────────────
  const { data: reservedRows } = await supabase
    .from('partner_assignments')
    .select(`
      id,
      installation_date,
      service_request:service_requests (
        id, category,
        customer:customers!service_requests_customer_id_fkey (id, name, phone)
      ),
      partner:partners (business_name, manager_phone, contact_phone)
    `)
    .eq('status', 'reserved')
    .eq('installation_date', tomorrowStr);

  for (const row of reservedRows || []) {
    try {
      const sr = Array.isArray(row.service_request) ? row.service_request[0] : row.service_request;
      const customer = Array.isArray(sr?.customer) ? sr.customer[0] : sr?.customer;
      const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner;
      if (!sr?.id) continue;

      const categoryLabel = CATEGORY_LABELS[sr.category] || sr.category;
      const businessName = partner?.business_name || '이음 파트너스';

      // 고객에게 예약 확인 알림
      if (customer?.phone) {
        await sendNotification({
          templateKey: 'CUSTOMER_RESERVATION_REMINDER',
          recipientPhone: customer.phone,
          recipientName: customer.name || '고객',
          variables: {
            services: categoryLabel,
            reservationDate: tomorrowStr,
            partnerName: businessName,
          },
          serviceRequestId: sr.id,
          eventKey: `reservation:reminder:${row.id}:${tomorrowStr}`,
          recipientId: customer.id,
        });
        reservationSent++;
      }

      // 제휴업체에게 내일 예약 알림
      const partnerPhone = partner?.manager_phone || partner?.contact_phone;
      if (partnerPhone) {
        await sendNotification({
          templateKey: 'PARTNER_RESERVATION_REMINDER',
          recipientPhone: partnerPhone,
          recipientName: businessName,
          variables: {
            reservationDate: tomorrowStr,
            customerName: customer?.name || '고객',
            customerPhone: customer?.phone || '-',
            services: categoryLabel,
          },
          serviceRequestId: sr.id,
          eventKey: `partner:reservation:reminder:${row.id}:${tomorrowStr}`,
        });
        partnerReservationSent++;
      }
    } catch (e) {
      errors.push(`reserved ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 2. 내일 방문상담(visit_date D-1) 건 ────────────────────────────────────
  const { data: visitingRows } = await supabase
    .from('partner_assignments')
    .select(`
      id,
      visit_date,
      service_request:service_requests (
        id, category,
        customer:customers!service_requests_customer_id_fkey (id, name, phone)
      ),
      partner:partners (business_name)
    `)
    .eq('status', 'visiting')
    .eq('visit_date', tomorrowStr);

  for (const row of visitingRows || []) {
    try {
      const sr = Array.isArray(row.service_request) ? row.service_request[0] : row.service_request;
      const customer = Array.isArray(sr?.customer) ? sr.customer[0] : sr?.customer;
      const partner = Array.isArray(row.partner) ? row.partner[0] : row.partner;
      if (!customer?.phone) continue;

      const CATEGORY_LABELS: Record<string, string> = {
        moving: '이사', cleaning: '입주청소', internet_tv: '인터넷·TV',
        interior: '인테리어', appliance_rental: '가전렌탈', kiosk: '키오스크',
      };
      const categoryLabel = CATEGORY_LABELS[sr?.category] || sr?.category || '서비스';
      const businessName = partner?.business_name || '이음 파트너스';

      await sendNotification({
        templateKey: 'CUSTOMER_VISIT_REMINDER',
        recipientPhone: customer.phone,
        recipientName: customer.name || '고객',
        variables: {
          customerName: customer.name || '고객',
          reservationDate: tomorrowStr,
          partnerName: businessName,
          services: categoryLabel,
        },
        serviceRequestId: sr?.id,
        eventKey: `visit:reminder:${row.id}:${tomorrowStr}`,
        recipientId: customer.id,
      });

      visitSent++;
    } catch (e) {
      errors.push(`visiting ${row.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    success: true,
    date: tomorrowStr,
    reservationReminderSent: reservationSent,
    partnerReservationReminderSent: partnerReservationSent,
    visitReminderSent: visitSent,
    errors: errors.length > 0 ? errors : undefined,
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
