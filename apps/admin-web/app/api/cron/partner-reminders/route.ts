/**
 * 제휴업체 리마인더 크론
 * - 배정 D+1 12:00 KST: 미예약(unread/read) 건 → 연락 대기 안내
 * - 12:00·17:00 KST: 상담예정(consulting) 건 → 동일 안내 반복
 * - 예약일 D+1: reserved 건 중 installation_date+1 경과 → 제휴·고객 완료 확인 요청
 *
 * 스케줄 권장: Vercel Cron 또는 외부 스케줄러에서 매일 12:00 KST, 17:00 KST에 호출
 *   예: "0 3,8 * * *" (UTC 03:00=KST 12:00, UTC 08:00=KST 17:00)
 * 호출: GET/POST /api/cron/partner-reminders (Authorization: Bearer CRON_SECRET)
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { sendNotification } from '@/lib/notification-service';
import { notifyCronFailure } from '@/lib/cron-notify';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const JOB_NAME = 'partner-reminders';

function authCheck(request: NextRequest): { ok: boolean; status?: number; body?: object } {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('CRON_SECRET 환경변수가 설정되지 않았습니다.');
    return { ok: false, status: 500, body: { error: 'Server configuration error' } };
  }
  const authHeader = request.headers.get('Authorization');
  if (authHeader !== `Bearer ${secret}`) {
    return { ok: false, status: 401, body: { error: 'Unauthorized' } };
  }
  return { ok: true };
}

async function getHandler(request: NextRequest) {
  const check = authCheck(request);
  if (!check.ok) {
    return NextResponse.json(check.body, { status: check.status ?? 401 });
  }
  try {
    return await runPartnerReminders();
  } catch (e) {
    await notifyCronFailure(JOB_NAME, e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '오류' },
      { status: 500 }
    );
  }
}

async function postHandler(request: NextRequest) {
  const check = authCheck(request);
  if (!check.ok) {
    return NextResponse.json(check.body, { status: check.status ?? 401 });
  }
  try {
    return await runPartnerReminders();
  } catch (e) {
    await notifyCronFailure(JOB_NAME, e);
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '오류' },
      { status: 500 }
    );
  }
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));

/** KST(한국 표준시) 현재 시각 — 크론 실행 시각에 따라 배정 D+1(12시 전용)·상담예정(12시·17시) 구분 */
function getKstHour(): number {
  const now = new Date();
  const kstOffset = 9 * 60;
  const localOffset = now.getTimezoneOffset();
  const kst = new Date(now.getTime() + (kstOffset + localOffset) * 60 * 1000);
  return kst.getHours();
}

function getKstDate(offsetDays = 0): string {
  const now = new Date();
  const kstOffsetMinutes = 9 * 60;
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60 * 1000;
  const kst = new Date(utcMs + kstOffsetMinutes * 60 * 1000);
  kst.setDate(kst.getDate() + offsetDays);
  return kst.toISOString().slice(0, 10);
}

async function runPartnerReminders() {
  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase 미설정' }, { status: 500 });
  }

  const kstHour = getKstHour();
  const runAt12 = kstHour === 12;
  const runAt17 = kstHour === 17;
  const allowD1 = runAt12; // 배정 D+1 리마인더: 매일 12:00 KST에만 발송
  const allowConsulting = runAt12 || runAt17; // 상담예정 리마인더: 12:00, 17:00 KST

  const today = getKstDate(0);
  const yesterday = getKstDate(-1);
  const sent: { type: string; count: number }[] = [
    { type: 'not_reserved', count: 0 },
    { type: 'consulting', count: 0 },
    { type: 'not_completed', count: 0 },
  ];

  // 1) 배정 D+1 12시: 미예약(unread/read) 건 → 연락 대기 안내 / 12시·17시: 상담예정(consulting) 건 → 동일 안내 반복
  const { data: assignmentsToRemind } = await supabase
    .from('partner_assignments')
    .select(`
      id, service_request_id, status, created_at,
      service_request:service_requests!inner (
        id,
        assigned_at,
        customer:customers!service_requests_customer_id_fkey (name, phone),
        assigned_partner:partners!service_requests_assigned_partner_id_fkey (
          id, business_name, manager_phone, contact_phone
        )
      )
    `)
    .in('status', ['unread', 'read', 'consulting']);

  for (const pa of assignmentsToRemind || []) {
    const sr = Array.isArray(pa.service_request) ? pa.service_request[0] : pa.service_request;
    const customer = sr?.customer && (Array.isArray(sr.customer) ? sr.customer[0] : sr.customer);
    const partner = sr?.assigned_partner && (Array.isArray(sr.assigned_partner) ? sr.assigned_partner[0] : sr.assigned_partner);
    const partnerPhone = partner?.manager_phone || partner?.contact_phone;
    if (!partnerPhone || !customer?.phone) continue;

    const assignedDate = sr?.assigned_at?.slice(0, 10);
    const isConsulting = pa.status === 'consulting';
    const isD1 = assignedDate === yesterday;
    if (isConsulting && !allowConsulting) continue;
    if (!isConsulting && (!allowD1 || !isD1)) continue;

    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || 'https://ieum2.netlify.app';
    const appLink = sr?.id ? `${baseUrl.replace(/\/$/, '')}/partner/assignments?sr=${sr.id}` : undefined;

    await sendNotification({
      templateKey: isConsulting ? 'PARTNER_CONSULTING_REMINDER' : 'PARTNER_UNPROCESSED',
      recipientPhone: partnerPhone,
      recipientName: partner?.business_name || '제휴업체',
      variables: {
        customerName: customer.name || '고객',
        customerPhone: customer.phone,
        ...(appLink && { appLink }),
      },
      serviceRequestId: sr?.id,
      eventKey: `partner-reminder:${isConsulting ? 'consulting' : 'd1'}:${pa.id}:${today}`,
    });
    if (isConsulting) sent[1].count++;
    else sent[0].count++;
  }

  // 2) 예약일+1일 12시 전용: reserved + installation_date+1 <= today → 제휴 리마인더 + 고객 업무확인 알림 발송 후 전체완료(completed) 자동 전환
  //    (17시 크론에서는 이 블록 생략 — "12시에 자동 전체완료" 요구사항)
  if (!runAt12) {
    return NextResponse.json({
      success: true,
      sent: { not_reserved: sent[0].count, consulting: sent[1].count, not_completed: 0 },
    });
  }

  const { data: reservedList } = await supabase
    .from('partner_assignments')
    .select(`
      id, service_request_id, installation_date,
      service_request:service_requests!inner (
        id, category,
        customer:customers!service_requests_customer_id_fkey (name, phone),
        assigned_partner:partners!service_requests_assigned_partner_id_fkey (business_name, manager_phone, contact_phone)
      )
    `)
    .eq('status', 'reserved')
    .not('installation_date', 'is', null);

  for (const pa of reservedList || []) {
    const inst = pa.installation_date;
    if (!inst) continue;
    const d1 = new Date(inst);
    d1.setDate(d1.getDate() + 1);
    const d1Str = d1.toISOString().slice(0, 10);
    if (d1Str > today) continue;

    const sr = Array.isArray(pa.service_request) ? pa.service_request[0] : pa.service_request;
    const customer = sr?.customer && (Array.isArray(sr.customer) ? sr.customer[0] : sr.customer);
    const partner = sr?.assigned_partner && (Array.isArray(sr.assigned_partner) ? sr.assigned_partner[0] : sr.assigned_partner);
    const partnerPhone = partner?.manager_phone || partner?.contact_phone;
    if (!partnerPhone || !customer?.phone) continue;

    const reservationDateStr = typeof inst === 'string' ? inst.slice(0, 10) : new Date(inst).toISOString().slice(0, 10);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_API_URL || 'https://ieum2.netlify.app';
    const appLink = sr?.id ? `${baseUrl.replace(/\/$/, '')}/partner/assignments?sr=${sr.id}` : undefined;

    await sendNotification({
      templateKey: 'PARTNER_RESERVATION_OVERDUE',
      recipientPhone: partnerPhone,
      recipientName: partner?.business_name || '제휴업체',
      variables: {
        customerName: customer.name || '고객',
        customerPhone: customer.phone,
        reservationDate: reservationDateStr,
        ...(appLink && { appLink }),
      },
      serviceRequestId: sr?.id,
      eventKey: `partner-reminder:reservation-overdue:${pa.id}:${today}`,
    });
    sent[2].count++;

    // 예약일+1일 경과 시 고객에게 업무처리 확인 알림 발송
    const categoryLabelMap: Record<string, string> = { moving: '이사', cleaning: '입주청소', internet_tv: '인터넷·TV', interior: '인테리어', appliance_rental: '가전렌탈', kiosk: '키오스크' };
    const srCategory = (sr as { category?: string })?.category;
    const categoryLabel = srCategory ? (categoryLabelMap[srCategory] ?? srCategory) : '서비스';
    if (customer?.phone) {
      await sendNotification({
        templateKey: 'CUSTOMER_WORK_CONFIRM',
        recipientPhone: customer.phone,
        recipientName: customer.name || '고객',
        variables: { services: categoryLabel, reservationDate: reservationDateStr },
        serviceRequestId: sr?.id,
        eventKey: `customer-work-confirm:${pa.id}:${today}`,
      });
    }

    // 응답 대기: 자동완료 제거 — 제휴업체가 앱에서 완료 또는 사유 입력 후 처리
  }

  return NextResponse.json({
    success: true,
    sent: { not_reserved: sent[0].count, consulting: sent[1].count, not_completed: sent[2].count },
  });
}
