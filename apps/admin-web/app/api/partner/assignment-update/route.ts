/**
 * 제휴업체용: 배정 상태 변경
 * - 예약완료: 예약일, 진행금액, 지원금 기록 + 고객 알림톡
 * - 부재중: 고객에게 문자 발송
 * - 취소: 사유 기록 + DB 반환 처리
 * - 메모: partner_assignment_memos 이력 기록
 */
import { utcNow } from '@/lib/shared-local';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import { sendReservationUpdateToCustomer } from '@/lib/reservation-notification';
import { sendSms } from '@/lib/alimtalk';
import { sendCancellationNotification, sendCompletionNotification } from '@/lib/notifications';
import { withErrorHandler } from '@/lib/api/error-handler';

async function postHandler(request: NextRequest) {
  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  const userId = session?.userId;
  if (!partnerId) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  let body: {
    assignmentId: string;
    status: string;
    updated_at?: string;
    installation_date?: string | null;
    visit_date?: string | null;
    cancel_reason?: string | null;
    cancel_reason_detail?: string | null;
    partner_memo?: string | null;
    reserved_price?: number | null;
    subsidy_amount?: number | null;
    subsidy_payment_date?: string | null;
    customer_payment_amount?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const {
    assignmentId,
    status,
    updated_at,
    installation_date,
    visit_date,
    cancel_reason,
    cancel_reason_detail,
    partner_memo,
    reserved_price,
    subsidy_amount,
    subsidy_payment_date,
    customer_payment_amount,
  } = body;

  if (!assignmentId || !status) {
    return NextResponse.json({ error: 'assignmentId, status 필요' }, { status: 400 });
  }
  if (!updated_at || !updated_at.trim()) {
    return NextResponse.json({ error: 'updated_at(버전)이 필요합니다. 새로고침 후 다시 시도해 주세요.' }, { status: 400 });
  }
  /**
   * 전체완료(completed): 예약완료(reserved) 상태에서만 수동 전환 가능.
   * 진행금액(customer_payment_amount) 입력 필수.
   */
  if (status === 'reserved' && (!installation_date || !installation_date.trim())) {
    return NextResponse.json({ error: '예약완료 시 설치(예약) 날짜는 필수입니다.' }, { status: 400 });
  }

  // 배정 정보 조회 (고객 연락처 포함)
  const { data: assignment, error: fetchErr } = await supabase
    .from('partner_assignments')
    .select(`
      id, partner_id, service_request_id, status, installation_date, updated_at,
      service_request:service_requests(
        id, category,
        customer:customers(name, phone)
      )
    `)
    .eq('id', assignmentId)
    .eq('partner_id', partnerId)
    .single();

  if (fetchErr || !assignment) {
    return NextResponse.json({ error: '배정 정보를 찾을 수 없거나 권한이 없습니다.' }, { status: 404 });
  }

  const currentStatus = (assignment as { status?: string }).status;
  if (status === 'completed') {
    if (currentStatus !== 'reserved') {
      return NextResponse.json({ error: '전체완료는 예약완료 상태에서만 가능합니다.' }, { status: 400 });
    }
    const amount = customer_payment_amount != null ? Number(customer_payment_amount) : null;
    if (amount == null || isNaN(amount) || amount < 0) {
      return NextResponse.json({ error: '전체완료 시 진행금액(고객지불)을 입력해주세요.' }, { status: 400 });
    }
  }

  const dbUpdatedAt = assignment.updated_at ? String(assignment.updated_at) : null;
  if (dbUpdatedAt !== updated_at) {
    return NextResponse.json({ error: '이미 다른 기기에서 변경됨' }, { status: 409 });
  }

  const oldInstallDate = assignment.installation_date ? String(assignment.installation_date).slice(0, 10) : null;
  const newInstallDate = installation_date?.trim()?.slice(0, 10) ?? null;
  const installationDateChanged = newInstallDate && (oldInstallDate !== newInstallDate || !oldInstallDate);

  // 파트너 업체명 조회 (실패 시 기본값 사용)
  let partnerBusinessName = '이음 파트너스';
  try {
    const { data: partnerInfo } = await supabase
      .from('partners')
      .select('business_name')
      .eq('id', partnerId)
      .single();
    if (partnerInfo?.business_name) partnerBusinessName = partnerInfo.business_name;
  } catch (e) {
    if (process.env.NODE_ENV === 'development') console.warn('[assignment-update] 파트너 업체명 조회 실패, 기본값 사용:', e);
  }

  // 고객 정보 추출
  const srRaw = assignment.service_request;
  const sr = Array.isArray(srRaw) ? srRaw[0] : srRaw;
  const custRaw = sr?.customer;
  const customer = Array.isArray(custRaw) ? custRaw[0] : custRaw;
  const customerPhone = customer?.phone || '';
  const customerName = customer?.name || '고객';
  const serviceCategory = sr?.category || '';

  const CATEGORY_LABELS: Record<string, string> = {
    moving: '이사', cleaning: '입주청소', internet_tv: '인터넷·TV',
    interior: '인테리어', appliance_rental: '가전렌탈', kiosk: '키오스크',
  };
  const categoryLabel = CATEGORY_LABELS[serviceCategory] || serviceCategory;

  // 전체완료: reserved → completed, 진행금액 기록 + hq_status 정산대기
  if (status === 'completed') {
    const amount = customer_payment_amount != null ? Number(customer_payment_amount) : 0;
    const nowIso = utcNow();
    const { data: upd, error: updErr } = await supabase
      .from('partner_assignments')
      .update({
        status: 'completed',
        completed_at: nowIso,
        customer_payment_amount: amount,
        updated_at: nowIso,
      })
      .eq('id', assignmentId)
      .eq('partner_id', partnerId)
      .eq('updated_at', updated_at)
      .select('id')
      .single();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!upd) return NextResponse.json({ error: '이미 다른 기기에서 변경됨' }, { status: 409 });

    await supabase
      .from('service_requests')
      .update({ hq_status: 'settlement_check', updated_at: nowIso })
      .eq('id', assignment.service_request_id);

    if (customerPhone) {
      void sendCompletionNotification(customerPhone, customerName, categoryLabel, assignment.service_request_id).catch(
        (e) => { if (process.env.NODE_ENV === 'development') console.warn('[assignment-update] 전체완료 알림 발송 실패:', e); }
      );
    }
    return NextResponse.json({ success: true });
  }

  // DB 반환 (partner_issue 취소)
  if (status === 'cancelled' && cancel_reason === 'partner_issue') {
    const { error: rpcErr } = await supabase.rpc('cancel_partner_assignment_for_staff', {
      p_service_request_id: assignment.service_request_id,
    });
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });

    // 메모 기록 (본사 memos 통합)
    if (partner_memo) {
      await supabase.from('partner_assignment_memos').insert({
        assignment_id: assignmentId,
        partner_id: partnerId,
        memo: partner_memo,
        status_at_time: 'cancelled',
      });
      if (userId) {
        await supabase.from('memos').insert({
          entity_type: 'service_request',
          entity_id: assignment.service_request_id,
          content: partner_memo,
          created_by: userId,
        });
      }
    }
    return NextResponse.json({ success: true });
  }

  // 예약완료: 트랜잭션 RPC + 금액 기록
  if (status === 'reserved') {
    const installDate = installation_date?.trim()?.slice(0, 10);
    if (!installDate) {
      return NextResponse.json({ error: '예약완료 시 설치(예약) 날짜는 필수입니다.' }, { status: 400 });
    }
    const { data: rpcResult, error: rpcErr } = await supabase.rpc('transition_partner_to_reserved', {
      p_service_request_id: assignment.service_request_id,
      p_installation_date: installDate,
      p_assignment_id: assignment.id,
    });
    const result = rpcResult as { success?: boolean; error?: string } | null;
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 });
    if (result?.success === false && result?.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // 예약 금액/지원금 업데이트
    const extraUpdates: Record<string, unknown> = {};
    if (reserved_price != null) extraUpdates.reserved_price = reserved_price;
    if (subsidy_amount != null) extraUpdates.subsidy_amount = subsidy_amount;
    if (subsidy_payment_date) extraUpdates.subsidy_payment_date = subsidy_payment_date;
    if (Object.keys(extraUpdates).length > 0) {
      await supabase.from('partner_assignments').update(extraUpdates).eq('id', assignmentId);
    }

    // 알림톡 발송
    if (installationDateChanged && newInstallDate) {
      await sendReservationUpdateToCustomer(assignment.service_request_id, newInstallDate);
    }

    // 메모 기록 (본사 memos 통합)
    if (partner_memo) {
      await supabase.from('partner_assignment_memos').insert({
        assignment_id: assignmentId,
        partner_id: partnerId,
        memo: partner_memo,
        status_at_time: 'reserved',
      });
      if (userId) {
        await supabase.from('memos').insert({
          entity_type: 'service_request',
          entity_id: assignment.service_request_id,
          content: partner_memo,
          created_by: userId,
        });
      }
    }
    return NextResponse.json({ success: true });
  }

  // 일반 상태 업데이트
  const assignmentUpdates: Record<string, unknown> = {
    status,
    updated_at: utcNow(),
  };
  if (installation_date !== undefined) assignmentUpdates.installation_date = installation_date;
  if (visit_date !== undefined) assignmentUpdates.visit_date = visit_date;
  if (cancel_reason !== undefined) assignmentUpdates.cancel_reason = cancel_reason;
  if (cancel_reason_detail !== undefined) assignmentUpdates.cancel_reason_detail = cancel_reason_detail;
  if (partner_memo !== undefined) assignmentUpdates.partner_memo = partner_memo;

  const { data: updated, error: updateErr } = await supabase
    .from('partner_assignments')
    .update(assignmentUpdates)
    .eq('id', assignment.id)
    .eq('partner_id', partnerId)
    .eq('updated_at', updated_at)
    .select('id');

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  if (!updated || updated.length === 0) {
    return NextResponse.json({ error: '이미 다른 기기에서 변경됨' }, { status: 409 });
  }

  // 예약일 변경 시 알림톡 재발송 (실패해도 상태 변경은 성공)
  if (installationDateChanged && newInstallDate) {
    try {
      await sendReservationUpdateToCustomer(assignment.service_request_id, newInstallDate);
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[assignment-update] 예약일 변경 알림 발송 실패:', e);
    }
  }

  // 방문상담 날짜 설정 시 고객에게 안내 문자 발송
  if (status === 'visiting' && visit_date && customerPhone) {
    const visitMsg = `이음 파트너스 "${partnerBusinessName}"입니다. ${customerName}님의 '${categoryLabel}' 방문상담이 ${visit_date} 에 예정되어 있습니다. 일정 변경이 필요하시면 언제든지 연락 주세요.`;
    try {
      await sendSms({ phone: customerPhone, message: visitMsg });
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[assignment-update] 방문상담 문자 발송 실패:', e);
    }
  }

  // 부재중 → 고객에게 문자 발송
  if (status === 'absent' && customerPhone) {
    const absentMsg = `이음 파트너스 "${partnerBusinessName}"입니다. 신청하신 '${categoryLabel}' 상담차 전화드렸으나 부재중이라 문자 남깁니다. 통화 가능하신 시간을 남겨주시거나, 편하실 때 연락주세요.`;
    try {
      await sendSms({ phone: customerPhone, message: absentMsg });
    } catch (e) {
      if (process.env.NODE_ENV === 'development') console.warn('[assignment-update] 부재중 문자 발송 실패:', e);
    }
  }

  // 메모 이력 기록 (본사 memos 통합)
  if (partner_memo) {
    await supabase.from('partner_assignment_memos').insert({
      assignment_id: assignmentId,
      partner_id: partnerId,
      memo: partner_memo,
      status_at_time: status,
    });
    if (userId) {
      await supabase.from('memos').insert({
        entity_type: 'service_request',
        entity_id: assignment.service_request_id,
        content: partner_memo,
        created_by: userId,
      });
    }
  }

  // 취소 시 고객에게 알림 발송 (업체명 포함 → 고객 취소 리스트에서 업체 내역 크로스 체크 가능)
  if (status === 'cancelled' && customerPhone) {
    void sendCancellationNotification(
      customerPhone,
      categoryLabel,
      assignment.service_request_id,
      partnerBusinessName
    ).catch((e) => {
      if (process.env.NODE_ENV === 'development') console.warn('[assignment-update] 취소 알림 발송 실패:', e);
    });
  }

  // 전체완료 시 고객에게 후기/평점 요청 알림 발송
  if (status === 'completed' && customerPhone) {
    void sendCompletionNotification(customerPhone, customerName, categoryLabel, assignment.service_request_id).catch(
      (e) => { if (process.env.NODE_ENV === 'development') console.warn('[assignment-update] 전체완료 알림 발송 실패:', e); }
    );
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
