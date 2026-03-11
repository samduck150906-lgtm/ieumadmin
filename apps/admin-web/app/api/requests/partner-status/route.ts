/**
 * 본사 직원용: 제휴업체 배정 상태 변경
 * - 예약일정(installation_date) 변경 시 고객에게 알림톡 재발송
 */
import { utcNow } from '@/lib/shared-local';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession } from '@/lib/auth-middleware';
import { sendReservationUpdateToCustomer } from '@/lib/reservation-notification';
import { sendCancellationNotification, sendCompletionNotification } from '@/lib/notifications';
import { SERVICE_CATEGORY_LABELS } from '@/types/database';
import type { PartnerStatus, PartnerCancelReason } from '@/types/database';
import { withErrorHandler } from '@/lib/api/error-handler';

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  let body: {
    serviceRequestId: string;
    status: PartnerStatus;
    assignment_updated_at?: string;
    installation_date?: string | null;
    cancel_reason?: PartnerCancelReason | null;
    cancel_reason_detail?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { serviceRequestId, status, assignment_updated_at, installation_date, cancel_reason, cancel_reason_detail } = body;
  if (!serviceRequestId || !status) {
    return NextResponse.json({ error: 'serviceRequestId, status 필요' }, { status: 400 });
  }
  if (!assignment_updated_at || !assignment_updated_at.trim()) {
    return NextResponse.json({ error: 'assignment_updated_at(버전)이 필요합니다. 새로고침 후 다시 시도해 주세요.' }, { status: 400 });
  }

  if (status === 'completed') {
    return NextResponse.json({ error: '전체완료는 설치일+1일 경과 후 자동 전환됩니다. 수동 변경은 불가합니다.' }, { status: 400 });
  }
  if (status === 'reserved' && (!installation_date || !installation_date.trim())) {
    return NextResponse.json({ error: '예약완료 시 설치(이사) 날짜는 필수입니다.' }, { status: 400 });
  }

  const { data: assignment, error: fetchErr } = await supabase
    .from('partner_assignments')
    .select('id, installation_date, partner_id, customer_payment_amount')
    .eq('service_request_id', serviceRequestId)
    .single();

  if (fetchErr || !assignment) {
    return NextResponse.json({ error: '배정 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const oldInstallDate = assignment.installation_date
    ? String(assignment.installation_date).slice(0, 10)
    : null;
  const newInstallDate = installation_date?.trim()?.slice(0, 10) ?? null;
  const installationDateChanged =
    newInstallDate && (oldInstallDate !== newInstallDate || !oldInstallDate);

  if (status === 'cancelled' && cancel_reason === 'partner_issue') {
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('cancel_partner_assignment_for_staff', {
      p_service_request_id: serviceRequestId,
    });
    const result = rpcResult as { success?: boolean; error?: string } | null;
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    if (result?.success === false && result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  }

  // 취소 시 고객에게 알림 발송
  if (status === 'cancelled') {
    try {
      const { data: sr } = await supabase
        .from('service_requests')
        .select('category, customer:customers!service_requests_customer_id_fkey (name, phone)')
        .eq('id', serviceRequestId)
        .single();
      if (sr) {
        const cust = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
        if (cust?.phone) {
          const catLabel = SERVICE_CATEGORY_LABELS[sr.category as keyof typeof SERVICE_CATEGORY_LABELS] || sr.category;
          void sendCancellationNotification(cust.phone, catLabel, serviceRequestId).catch((e) => {
            if (process.env.NODE_ENV === 'development') console.warn('[partner-status] 취소 알림 발송 실패:', e);
          });
        }
      }
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[partner-status] 취소 시 고객 정보 조회 또는 알림 처리 실패:', e);
    }
  }

  // 예약완료: 트랜잭션 RPC (상태 업데이트 + 미수 생성 unique check)
  if (status === 'reserved') {
    const installDate = installation_date?.trim()?.slice(0, 10);
    if (!installDate) {
      return NextResponse.json({ error: '예약완료 시 설치(이사) 날짜는 필수입니다.' }, { status: 400 });
    }
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('transition_partner_to_reserved', {
      p_service_request_id: serviceRequestId,
      p_installation_date: installDate,
      p_assignment_id: assignment.id,
    });
    const result = rpcResult as { success?: boolean; error?: string } | null;
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    if (result?.success === false && result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    if (installationDateChanged && newInstallDate) {
      try {
        await sendReservationUpdateToCustomer(serviceRequestId, newInstallDate);
      } catch (e) {
        if (process.env.NODE_ENV === 'development') console.warn('[partner-status] 예약일 변경 알림 발송 실패:', e);
      }
    }
    return NextResponse.json({ success: true });
  }

  const assignmentUpdates: Record<string, unknown> = {
    status,
    updated_at: utcNow(),
  };
  if (installation_date !== undefined) {
    assignmentUpdates.installation_date = installation_date;
  }
  if (cancel_reason !== undefined) assignmentUpdates.cancel_reason = cancel_reason;
  if (cancel_reason_detail !== undefined) assignmentUpdates.cancel_reason_detail = cancel_reason_detail;

  const { data: updated, error: updateErr } = await supabase
    .from('partner_assignments')
    .update(assignmentUpdates)
    .eq('id', assignment.id)
    .eq('updated_at', assignment_updated_at)
    .select('id');

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: '이미 다른 기기에서 변경됨' }, { status: 409 });
  }

  if (installationDateChanged && newInstallDate) {
    try {
      await sendReservationUpdateToCustomer(serviceRequestId, newInstallDate);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[partner-status] 예약일 변경 알림 발송 실패:', e);
    }
  }

  // 전체완료(completed)는 본 API에서 수동 설정 불가(41행에서 400 반환) → 마일리지 적립은
  // 설치일+1일 자동 전환 처리하는 별도 경로(크론 등)에서 수행

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
