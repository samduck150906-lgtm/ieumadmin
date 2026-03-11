import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseOrServer } from '../supabase';
import { sanitizeSearchQuery, extractDigitsForPhone, toPhoneSearchPattern } from '@/lib/sanitize';
import { Customer, ServiceRequest, ServiceCategory, HqStatus, SERVICE_CATEGORY_LABELS } from '@/types/database';
import type { PartnerStatus, PartnerCancelReason } from '@/types/database';
import { getRandomPartner } from './partners';
import { sendNotification } from '@/lib/notification-service';
import { sendRealtorRevenueNotification, type RealtorRevenueType } from '@/lib/notify-realtor-revenue';

// 고객별 서비스 요청 목록 조회 (묶음 표시, status/category/assignmentFilter 있으면 DB 레벨 필터)
export async function getCustomersWithRequests(params?: {
  search?: string;
  status?: HqStatus;
  category?: ServiceCategory;
  /** @deprecated assignmentFilter 사용 권장 */
  unassignedOnly?: boolean;
  /** 배정 상태: 'all' 전체, 'assigned' 배정만, 'unassigned' 미배정만 */
  assignmentFilter?: 'all' | 'assigned' | 'unassigned';
  page?: number;
  limit?: number;
}) {
  const { search, status, category, unassignedOnly, assignmentFilter, page = 1, limit = 20 } = params || {};
  const effectiveUnassigned = assignmentFilter === 'unassigned' || (assignmentFilter !== 'assigned' && unassignedOnly);
  const effectiveAssignedOnly = assignmentFilter === 'assigned';
  const supabase = getSupabaseOrServer();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  // status, category, assignmentFilter 필터 시: 해당하는 customer_id 목록을 먼저 조회 후 고객 목록 조회
  let customerIdFilter: string[] | undefined;
  if (status || category || effectiveUnassigned || effectiveAssignedOnly) {
    let q = supabase.from('service_requests').select('customer_id');
    if (status) q = q.eq('hq_status', status);
    if (category) q = q.eq('category', category);
    if (effectiveUnassigned) q = q.is('assigned_partner_id', null);
    if (effectiveAssignedOnly) q = q.not('assigned_partner_id', 'is', null);
    const { data: ids } = await q;
    const set = new Set((ids || []).map((r: { customer_id: string }) => r.customer_id));
    customerIdFilter = Array.from(set);
    if (customerIdFilter.length === 0) {
      return { data: [], total: 0, page, limit, totalPages: 0 };
    }
  }

  let customerQuery = supabase
    .from('customers')
    .select(`
      *,
      source_realtor:realtors!customers_source_realtor_id_fkey (
        id, business_name
      ),
      service_requests (
        id,
        category,
        hq_status,
        hq_memo,
        assigned_partner_id,
        assigned_at,
        requested_product,
        created_at,
        assigned_partner:partners!service_requests_assigned_partner_id_fkey (
          id, business_name, manager_name, manager_phone
        ),
        partner_assignment:partner_assignments (
          id, status, installation_date, cancel_reason, cancel_reason_detail,
          customer_payment_amount, support_amount, support_amount_promise,
          realtor_commission_amount, realtor_commission_complete_amount,
          realtor_commission_memo, partner_payment_request_amount
        )
      )
    `, { count: 'exact' })
    .order('created_at', { ascending: false });

  if (search) {
    const sanitized = sanitizeSearchQuery(search);
    if (sanitized) {
      const digits = extractDigitsForPhone(search);
      const phonePattern = toPhoneSearchPattern(digits);
      // 전화번호: 7자리 이상이면 유연 패턴(010-1234-5678, 01012345678 등 모두 매치), 아니면 일반 검색
      const phoneCond = phonePattern ? `phone.ilike.${phonePattern}` : `phone.ilike.%${sanitized}%`;
      customerQuery = customerQuery.or(`name.ilike.%${sanitized}%,${phoneCond},moving_address.ilike.%${sanitized}%`);
    }
  }

  if (customerIdFilter) {
    customerQuery = customerQuery.in('id', customerIdFilter);
  }

  customerQuery = customerQuery.range(from, to);

  const { data, error, count } = await customerQuery;

  if (error) throw error;

  return {
    data: data || [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  };
}

// 서비스 요청 상세 조회
export async function getServiceRequestById(id: string) {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('service_requests')
    .select(`
      *,
      customer:customers!service_requests_customer_id_fkey (*),
      assigned_partner:partners!service_requests_assigned_partner_id_fkey (
        *, user:users!partners_user_id_fkey (*)
      ),
      partner_assignment:partner_assignments (id, status, installation_date, customer_payment_amount, support_amount, support_amount_promise, partner_memo, cancel_reason, cancel_reason_detail, created_at, updated_at)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data;
}

// 서비스 요청 상태 변경
export async function updateServiceRequestStatus(id: string, status: HqStatus) {
  const supabase = getSupabaseOrServer();
  const updates: { hq_status: HqStatus; updated_at: string; hq_read_at?: string } = {
    hq_status: status,
    updated_at: new Date().toISOString(),
  };
  if (status === 'read') {
    updates.hq_read_at = new Date().toISOString();
  }

  const { error } = await supabase
    .from('service_requests')
    .update(updates)
    .eq('id', id);

  if (error) throw error;
}

// 메모 저장 (본사 메모, 레거시 단일 필드)
export async function updateServiceRequestMemo(id: string, memo: string) {
  const supabase = getSupabaseOrServer();
  const { error } = await supabase
    .from('service_requests')
    .update({
      hq_memo: memo,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

// 신청상품 저장
export async function updateServiceRequestRequestedProduct(id: string, requested_product: string | null) {
  const supabase = getSupabaseOrServer();
  const { error } = await supabase
    .from('service_requests')
    .update({
      requested_product: requested_product || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id);

  if (error) throw error;
}

// 진행금액·지원금액·약속일정·공인중개사수익쉐어 저장 (partner_assignments)
export async function updatePartnerAssignmentAmounts(
  serviceRequestId: string,
  updates: {
    customer_payment_amount?: number | null;
    support_amount?: number | null;
    support_amount_promise?: string | null;
    realtor_commission_amount?: number | null;
    realtor_commission_complete_amount?: number | null;
    realtor_commission_memo?: string | null;
    partner_payment_request_amount?: number | null;
  }
) {
  const supabase = getSupabaseOrServer();
  const { data: assignment } = await supabase
    .from('partner_assignments')
    .select('id')
    .eq('service_request_id', serviceRequestId)
    .single();

  if (!assignment) throw new Error('배정 정보를 찾을 수 없습니다.');

  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.customer_payment_amount !== undefined) payload.customer_payment_amount = updates.customer_payment_amount;
  if (updates.support_amount !== undefined) payload.support_amount = updates.support_amount;
  if (updates.support_amount_promise !== undefined) payload.support_amount_promise = updates.support_amount_promise;
  if (updates.realtor_commission_amount !== undefined) payload.realtor_commission_amount = updates.realtor_commission_amount;
  if (updates.realtor_commission_complete_amount !== undefined) payload.realtor_commission_complete_amount = updates.realtor_commission_complete_amount;
  if (updates.realtor_commission_memo !== undefined) payload.realtor_commission_memo = updates.realtor_commission_memo;
  if (updates.partner_payment_request_amount !== undefined) payload.partner_payment_request_amount = updates.partner_payment_request_amount;

  const { error } = await supabase
    .from('partner_assignments')
    .update(payload)
    .eq('id', assignment.id);

  if (error) throw error;
}

/** 통합 메모 목록 (memos 테이블, entity_type=service_request) — 본사·제휴 공유, @ 확인요청 가능 */
export async function listMemosForServiceRequest(serviceRequestId: string): Promise<
  { id: string; content: string; created_at: string; created_by: string | null; created_by_user?: { name?: string; email?: string } | null }[]
> {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('memos')
    .select('id, content, created_at, created_by')
    .eq('entity_type', 'service_request')
    .eq('entity_id', serviceRequestId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((r: { created_by: string | null }) => r.created_by).filter(Boolean))) as string[];
  let userMap: Record<string, { name?: string; email?: string }> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, name, email').in('id', userIds);
    userMap = (users || []).reduce((acc: Record<string, { name?: string; email?: string }>, u: { id: string; name?: string; email?: string }) => {
      acc[u.id] = { name: u.name, email: u.email };
      return acc;
    }, {});
  }
  return rows.map((row: { id: string; content: string; created_at: string; created_by: string | null }) => ({
    id: row.id,
    content: row.content,
    created_at: row.created_at,
    created_by: row.created_by,
    created_by_user: row.created_by ? userMap[row.created_by] ?? null : null,
  }));
}

/** 통합 메모 추가 (내용에 @ 포함 시 확인요청 표시) */
export async function addServiceRequestMemo(serviceRequestId: string, content: string, createdBy: string) {
  const supabase = getSupabaseOrServer();
  const { error } = await supabase.from('memos').insert({
    entity_type: 'service_request',
    entity_id: serviceRequestId,
    content: content.trim(),
    created_by: createdBy,
  });

  if (error) throw error;
}

// 제휴업체 배정 (내부: supabase 클라이언트 사용)
async function assignPartnerWithSupabase(
  supabase: SupabaseClient,
  requestId: string,
  partnerId: string,
  assignedBy: string
) {
  const { error: updateError } = await supabase
    .from('service_requests')
    .update({
      assigned_partner_id: partnerId,
      assigned_at: new Date().toISOString(),
      assigned_by: assignedBy,
      hq_status: 'assigned',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  if (updateError) throw updateError;

  const { error: assignError } = await supabase
    .from('partner_assignments')
    .insert({
      service_request_id: requestId,
      partner_id: partnerId,
      status: 'unread',
    });

  if (assignError) throw assignError;

  // 배정 완료 후 고객·제휴업체에 자동 SMS/알림톡 발송
  try {
    const { data: sr } = await supabase
      .from('service_requests')
      .select(`
        id, category,
        customer:customers!service_requests_customer_id_fkey (name, phone, moving_date, current_address, moving_address)
      `)
      .eq('id', requestId)
      .single();

    const { data: partner } = await supabase
      .from('partners')
      .select('business_name, manager_name, manager_phone, contact_phone')
      .eq('id', partnerId)
      .single();

    if (sr && partner) {
      const customer = Array.isArray(sr.customer) ? sr.customer[0] : sr.customer;
      const categoryLabel = SERVICE_CATEGORY_LABELS[sr.category as keyof typeof SERVICE_CATEGORY_LABELS] || sr.category;
      const customerPhone = customer?.phone;
      const partnerPhone = partner.manager_phone || partner.contact_phone;

      // 고객에게 배정 알림 (알림톡 실발송: 알리고·카카오 연동)
      if (customerPhone) {
        await sendNotification({
          templateKey: 'CUSTOMER_PARTNER_ASSIGNED',
          recipientPhone: customerPhone,
          recipientName: customer?.name || '고객',
          variables: {
            category: categoryLabel,
            partnerName: partner.business_name || '',
            managerName: partner.manager_name || '',
            managerPhone: partner.manager_phone || partner.contact_phone || '',
          },
          serviceRequestId: requestId,
        });
      }

      // 제휴업체에게 신규 배정 알림 (알림톡 실발송)
      if (partnerPhone) {
        await sendNotification({
          templateKey: 'PARTNER_NEW_ASSIGNMENT',
          recipientPhone: partnerPhone,
          recipientName: partner.business_name || '제휴업체',
          variables: {
            customerName: customer?.name || '고객',
            customerPhone: customerPhone || '',
            category: categoryLabel,
            movingDate: customer?.moving_date || '미정',
            address: customer?.moving_address || customer?.current_address || '미정',
          },
          serviceRequestId: requestId,
        });
      }
    }
  } catch (notifyErr) {
    // 알림 발송 실패는 배정 자체를 실패시키지 않음 (로그만 기록)
    console.error('[배정 알림 발송 실패]', notifyErr);
  }
}

/** 제휴업체 배정 — 서버에서 전달한 Supabase 클라이언트 사용 (API 라우트용) */
export async function assignPartnerWithClient(
  supabase: SupabaseClient,
  requestId: string,
  partnerId: string,
  assignedBy: string
) {
  return assignPartnerWithSupabase(supabase, requestId, partnerId, assignedBy);
}

// 제휴업체 배정
export async function assignPartner(
  requestId: string,
  partnerId: string,
  assignedBy: string
) {
  const supabase = getSupabaseOrServer();
  return assignPartnerWithSupabase(supabase, requestId, partnerId, assignedBy);
}

// 랜덤 배정
export async function assignRandomPartner(
  requestId: string,
  category: ServiceCategory,
  assignedBy: string
) {
  const partner = await getRandomPartner(category);
  
  if (!partner) {
    throw new Error(`해당 카테고리(${category})에 배정 가능한 업체가 없습니다.`);
  }

  await assignPartner(requestId, partner.id, assignedBy);
  return partner;
}

// 일괄 배정
export async function bulkAssignPartners(
  requestIds: string[],
  assignedBy: string,
  mode: 'random' | 'specific',
  partnerId?: string
) {
  const supabase = getSupabaseOrServer();
  const results = [];

  for (const requestId of requestIds) {
    try {
      if (mode === 'random') {
        // 각 요청의 카테고리에 맞는 랜덤 배정
        const { data: request } = await supabase
          .from('service_requests')
          .select('category')
          .eq('id', requestId)
          .single();

        if (request) {
          const partner = await assignRandomPartner(requestId, request.category, assignedBy);
          results.push({ requestId, success: true, partner });
        }
      } else if (partnerId) {
        await assignPartner(requestId, partnerId, assignedBy);
        results.push({ requestId, success: true });
      }
    } catch (err) {
      results.push({ requestId, success: false, error: err instanceof Error ? err.message : '배정 실패' });
    }
  }

  return results;
}

/** 명령어9: partner_issue 취소 시 배정 해제·hq_status 'read' 복귀 (별도 호출용) */
export async function cancelPartnerAssignment(serviceRequestId: string) {
  const supabase = getSupabaseOrServer();
  const { error: assignError } = await supabase
    .from('service_requests')
    .update({
      assigned_partner_id: null,
      assigned_at: null,
      assigned_by: null,
      hq_status: 'read',
      updated_at: new Date().toISOString(),
    })
    .eq('id', serviceRequestId);

  if (assignError) throw assignError;

  const { data: assignment } = await supabase
    .from('partner_assignments')
    .select('id')
    .eq('service_request_id', serviceRequestId)
    .single();

  if (assignment) {
    await supabase
      .from('partner_assignments')
      .update({
        status: 'cancelled',
        cancel_reason: 'partner_issue',
        updated_at: new Date().toISOString(),
      })
      .eq('id', assignment.id);
  }
}

/** 명령어9: 예약완료 시 설치일 필수, auto_complete_at = 설치일+1일 */
export async function reservePartnerAssignment(
  serviceRequestId: string,
  installationDate: string
) {
  const supabase = getSupabaseOrServer();
  if (!installationDate || !installationDate.trim()) {
    throw new Error('예약완료 처리 시 설치(이사) 날짜는 필수입니다.');
  }

  const d = new Date(installationDate);
  d.setDate(d.getDate() + 1);
  const autoCompleteAt = d.toISOString().slice(0, 10);

  const { data: assignment } = await supabase
    .from('partner_assignments')
    .select('id')
    .eq('service_request_id', serviceRequestId)
    .single();

  if (!assignment) throw new Error('배정 정보를 찾을 수 없습니다.');

  const { error } = await supabase
    .from('partner_assignments')
    .update({
      status: 'reserved',
      installation_date: installationDate.slice(0, 10),
      auto_complete_at: autoCompleteAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', assignment.id);

  if (error) throw error;
}

/** 명령어9: reserved + auto_complete_at 경과 건을 completed로 전환 (크론 등에서 호출)
 *  - auto_complete_reserved_assignments RPC 호출 (수수료 생성 + hq_status 전환 원자적 처리)
 *  - 완료된 건에 대해 고객에게 후기 요청 알림 발송
 */
export async function checkAutoComplete(): Promise<{ processed: number }> {
  const supabase = getSupabaseOrServer();

  // 완료 전 대상 목록 먼저 조회 (후기 알림 발송용)
  const now = new Date().toISOString().slice(0, 10);
  const { data: pendingList } = await supabase
    .from('partner_assignments')
    .select(`
      id, service_request_id,
      service_request:service_requests!inner(
        id, category, hq_status,
        customer:customers!service_requests_customer_id_fkey(id, name, phone)
      )
    `)
    .eq('status', 'reserved')
    .not('auto_complete_at', 'is', null)
    .lte('auto_complete_at', now);

  // RPC로 원자적 처리 (수수료 생성 + hq_status → settlement_check + completed 전환)
  const { data: rpcResult, error: rpcError } = await supabase.rpc(
    'auto_complete_reserved_assignments'
  );

  if (rpcError) throw rpcError;
  const processed = Number((rpcResult as { processed?: number } | null)?.processed ?? 0);

  // 완료된 건들에 후기 요청 알림 발송
  for (const row of pendingList || []) {
    try {
      const srRaw = row.service_request;
      const sr = Array.isArray(srRaw) ? srRaw[0] : srRaw;
      if (!sr) continue;

      const custRaw = sr.customer;
      const customer = Array.isArray(custRaw) ? custRaw[0] : custRaw;
      if (!customer?.phone) continue;

      await sendNotification({
        templateKey: 'CUSTOMER_COMPLETED',
        recipientPhone: customer.phone,
        recipientName: customer.name || '고객',
        variables: {
          services: SERVICE_CATEGORY_LABELS[sr.category as keyof typeof SERVICE_CATEGORY_LABELS] || sr.category,
        },
        serviceRequestId: String(row.service_request_id),
        eventKey: `completion:review:${row.service_request_id}`,
        recipientId: customer.id,
      });
    } catch (e) {
      console.error('[requests] CUSTOMER_COMPLETED 알림 발송 실패:', e);
    }
  }

  // 방금 생성된 conversion / referral 수수료에 대해 공인중개사 수익 실시간 알림 발송
  if (processed > 0) {
    const since = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    const { data: recentCommissions } = await supabase
      .from('commissions')
      .select('realtor_id, commission_type, amount, service_request_id')
      .in('commission_type', ['conversion', 'referral'])
      .gte('created_at', since);

    const byRealtorAndType: Record<string, { amount: number; serviceRequestId?: string }> = {};
    for (const c of recentCommissions || []) {
      const key = `${c.realtor_id}:${c.commission_type}`;
      if (!byRealtorAndType[key]) {
        byRealtorAndType[key] = { amount: 0, serviceRequestId: c.service_request_id ?? undefined };
      }
      byRealtorAndType[key].amount += Number(c.amount ?? 0);
    }
    const revenueTypeMap: Record<string, RealtorRevenueType> = {
      conversion: 'converted',
      referral: 'referral',
    };
    for (const [key, { amount, serviceRequestId }] of Object.entries(byRealtorAndType)) {
      if (amount <= 0) continue;
      const [realtorId, commissionType] = key.split(':');
      const revenueType = revenueTypeMap[commissionType];
      if (!revenueType) continue;
      try {
        await sendRealtorRevenueNotification({
          realtorId,
          revenueType,
          amount,
          serviceRequestId,
        });
      } catch (e) {
        console.error('[requests] sendRealtorRevenueNotification 실패:', e);
      }
    }
  }

  return { processed };
}

/** 명령어17: 배정 후 2시간 내 미열람/미상태변경 시 자동 배정취소→재배정 (크론, 운영시간 내 호출) */
const STALLED_HOURS = 2;
export async function markStalledAssignments(): Promise<{ processed: number }> {
  const supabase = getSupabaseOrServer();
  const cutoff = new Date(Date.now() - STALLED_HOURS * 60 * 60 * 1000).toISOString();

  const { data: list } = await supabase
    .from('partner_assignments')
    .select('id, service_request_id')
    .in('status', ['unread', 'read', 'consulting'])
    .lt('created_at', cutoff);

  let processed = 0;
  for (const row of list || []) {
    const { data: sr } = await supabase
      .from('service_requests')
      .select('hq_status')
      .eq('id', row.service_request_id)
      .single();
    if (sr?.hq_status === 'hq_review_needed') continue;

    const { error: assignErr } = await supabase
      .from('partner_assignments')
      .update({
        status: 'pending',
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    if (!assignErr) {
      await supabase
        .from('service_requests')
        .update({
          hq_status: 'hq_review_needed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.service_request_id);
      processed++;
    }
  }
  return { processed };
}

// 제휴업체 배정 상태 변경 (상담예정/예약완료/전체완료/보류/취소)
export async function updatePartnerAssignmentStatus(
  serviceRequestId: string,
  updates: {
    status: PartnerStatus;
    installation_date?: string | null;
    cancel_reason?: PartnerCancelReason | null;
    cancel_reason_detail?: string | null;
    reserved_price?: number | null;
    subsidy_amount?: number | null;
    subsidy_payment_date?: string | null;
  }
) {
  const {
    status,
    installation_date,
    cancel_reason,
    cancel_reason_detail,
    reserved_price,
    subsidy_amount,
    subsidy_payment_date,
  } = updates;
  const supabase = getSupabaseOrServer();

  const { data: assignment } = await supabase
    .from('partner_assignments')
    .select('id')
    .eq('service_request_id', serviceRequestId)
    .single();

  if (!assignment) throw new Error('배정 정보를 찾을 수 없습니다.');

  if (status === 'cancelled' && cancel_reason === 'partner_issue') {
    await cancelPartnerAssignment(serviceRequestId);
    return;
  }

  // 예약완료: transition_partner_to_reserved RPC 호출
  // - partner_assignments 업데이트 + partner_receivables 생성 + hq_status 정산확인 전환을 원자적으로 처리
  if (status === 'reserved') {
    if (!installation_date || !installation_date.trim()) {
      throw new Error('예약완료 처리 시 설치(이사) 날짜는 필수입니다.');
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc(
      'transition_partner_to_reserved',
      {
        p_service_request_id: serviceRequestId,
        p_installation_date: installation_date,
        p_assignment_id: assignment.id,
      }
    );

    if (rpcError) throw rpcError;
    if (!rpcResult?.success) {
      throw new Error(rpcResult?.error ?? '예약완료 전환에 실패했습니다.');
    }

    // 예약가·보조금 등 추가 정보는 별도 업데이트
    const extraUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (reserved_price !== undefined) extraUpdates.reserved_price = reserved_price;
    if (subsidy_amount !== undefined) extraUpdates.subsidy_amount = subsidy_amount;
    if (subsidy_payment_date !== undefined) extraUpdates.subsidy_payment_date = subsidy_payment_date;

    if (Object.keys(extraUpdates).length > 1) {
      const { error: extraErr } = await supabase
        .from('partner_assignments')
        .update(extraUpdates)
        .eq('id', assignment.id);
      if (extraErr) throw extraErr;
    }
    return;
  }

  // 그 외 상태: 직접 업데이트
  const assignmentUpdates: {
    status: PartnerStatus;
    updated_at: string;
    installation_date?: string | null;
    cancel_reason?: PartnerCancelReason | null;
    cancel_reason_detail?: string | null;
    reserved_price?: number | null;
    subsidy_amount?: number | null;
    subsidy_payment_date?: string | null;
  } = { status, updated_at: new Date().toISOString() };

  if (installation_date !== undefined) assignmentUpdates.installation_date = installation_date;
  if (cancel_reason !== undefined) assignmentUpdates.cancel_reason = cancel_reason;
  if (cancel_reason_detail !== undefined) assignmentUpdates.cancel_reason_detail = cancel_reason_detail;
  if (reserved_price !== undefined) assignmentUpdates.reserved_price = reserved_price;
  if (subsidy_amount !== undefined) assignmentUpdates.subsidy_amount = subsidy_amount;
  if (subsidy_payment_date !== undefined) assignmentUpdates.subsidy_payment_date = subsidy_payment_date;

  const { error } = await supabase
    .from('partner_assignments')
    .update(assignmentUpdates)
    .eq('id', assignment.id);

  if (error) throw error;
}

// 서비스 요청 통계 (DB RPC 집계 → 실패 시 직접 쿼리 폴백)
export async function getServiceRequestStats() {
  const supabase = getSupabaseOrServer();

  // 1차: RPC 호출
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_request_stats');

  if (!rpcError && rpcData) {
    return {
      total:     Number(rpcData.total)            || 0,
      unread:    Number(rpcData.unread)            || 0,
      assigned:  Number(rpcData.assigned)          || 0,
      completed: Number(rpcData.completed)         || 0,
      thisMonth: Number(rpcData.this_month)        || 0,
    };
  }

  // 2차 폴백: RPC 함수 미존재 또는 스키마 캐시 오류 시 직접 집계
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    { count: total },
    { count: unread },
    { count: assigned },
    { count: completed },
    { count: thisMonth },
  ] = await Promise.all([
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).neq('hq_status', 'cancelled'),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).eq('hq_status', 'unread'),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).eq('hq_status', 'assigned'),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).eq('hq_status', 'settlement_done'),
    supabase.from('service_requests').select('id', { count: 'exact', head: true }).gte('created_at', thisMonthStart).neq('hq_status', 'cancelled'),
  ]);

  return {
    total:     total     ?? 0,
    unread:    unread    ?? 0,
    assigned:  assigned  ?? 0,
    completed: completed ?? 0,
    thisMonth: thisMonth ?? 0,
  };
}

/** 카테고리별 미배정 건수 (서비스요청 DB 관리용) */
export async function getUnassignedCountByCategory(): Promise<Record<string, number>> {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('service_requests')
    .select('category')
    .is('assigned_partner_id', null)
    .not('hq_status', 'eq', 'cancelled');

  if (error) throw error;
  const count: Record<string, number> = {};
  (data || []).forEach((row: { category: string }) => {
    count[row.category] = (count[row.category] ?? 0) + 1;
  });
  return count;
}

/** 당일 배정 건만 필터 (KST 기준 날짜 비교) */
function isAssignedToday(assignedAt: string | null): boolean {
  if (!assignedAt) return false;
  const d = new Date(assignedAt);
  const today = new Date();
  return d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
}

/** 일괄 배정 취소 (당일 배정 건만 선택 가능 옵션, 요구사항: 경고 후 처리) */
export async function bulkUnassignAssignments(
  requestIds: string[],
  options: { sameDayOnly?: boolean } = {}
): Promise<{ success: number; skipped: number; errors: { requestId: string; message: string }[] }> {
  const supabase = getSupabaseOrServer();
  const { sameDayOnly = true } = options;
  const errors: { requestId: string; message: string }[] = [];
  let success = 0;
  let skipped = 0;

  let idsToProcess = requestIds;
  if (sameDayOnly && requestIds.length > 0) {
    const { data: rows } = await supabase
      .from('service_requests')
      .select('id, assigned_at')
      .in('id', requestIds)
      .not('assigned_at', 'is', null);
    const todayIds = (rows || []).filter((r: { id: string; assigned_at: string }) => isAssignedToday(r.assigned_at)).map((r: { id: string }) => r.id);
    idsToProcess = todayIds;
    skipped = requestIds.length - todayIds.length;
  }

  for (const requestId of idsToProcess) {
    try {
      await cancelPartnerAssignment(requestId);
      success++;
    } catch (e) {
      errors.push({ requestId, message: e instanceof Error ? e.message : '배정 취소 실패' });
    }
  }
  return { success, skipped, errors };
}

const DELAYED_HOURS = 24;

/** 지연 DB 목록 (배정 후 24시간 경과, 미완료/미취소) */
export async function getDelayedAssignments(): Promise<
  { id: string; service_request_id: string; assigned_at: string; category: string; customer_name?: string; customer_phone?: string }[]
> {
  const supabase = getSupabaseOrServer();
  const cutoff = new Date(Date.now() - DELAYED_HOURS * 60 * 60 * 1000).toISOString();
  const { data: srList } = await supabase
    .from('service_requests')
    .select('id, assigned_at, category, customer:customers!service_requests_customer_id_fkey(name, phone)')
    .not('assigned_partner_id', 'is', null)
    .lt('assigned_at', cutoff);

  if (!srList || srList.length === 0) return [];
  const srIds = srList.map((r: { id: string }) => r.id);
  const { data: paList } = await supabase
    .from('partner_assignments')
    .select('id, service_request_id, status')
    .in('service_request_id', srIds)
    .in('status', ['unread', 'read', 'consulting', 'reserved', 'pending']);

  const delayedPaIds = new Set((paList || []).map((p: { service_request_id: string }) => p.service_request_id));
  return srList
    .filter((r: { id: string }) => delayedPaIds.has(r.id))
    .map((r: { id: string; assigned_at: string; category: string; customer?: { name?: string; phone?: string } | { name?: string; phone?: string }[] }) => {
      const customer = Array.isArray(r.customer) ? r.customer[0] : r.customer;
      return {
        id: r.id,
        service_request_id: r.id,
        assigned_at: r.assigned_at,
        category: r.category,
        customer_name: customer?.name,
        customer_phone: customer?.phone,
      };
    });
}

/** 지연 DB 배정 해제 (미배정 전환 → 타업체 DB 구매 가능) */
export async function unassignDelayedAssignment(serviceRequestId: string): Promise<void> {
  return cancelPartnerAssignment(serviceRequestId);
}

export type StatusHistoryEntry = {
  entity_id: string;
  new_status: string;
  old_status: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
};

/** 여러 entity의 상태 이력을 한 번에 조회 (entity_id → 이력 배열) */
export async function getBatchStatusHistory(
  entityIds: string[]
): Promise<Record<string, StatusHistoryEntry[]>> {
  if (entityIds.length === 0) return {};
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('status_history')
    .select('entity_id, new_status, old_status, changed_by, created_at')
    .in('entity_id', entityIds)
    .order('created_at', { ascending: false });

  if (error) throw error;
  const rows = data || [];
  const userIds = Array.from(new Set(rows.map((r: { changed_by: string | null }) => r.changed_by).filter(Boolean))) as string[];
  let userMap: Record<string, string> = {};
  if (userIds.length > 0) {
    const { data: users } = await supabase.from('users').select('id, name').in('id', userIds);
    userMap = (users || []).reduce((acc: Record<string, string>, u: { id: string; name?: string }) => {
      acc[u.id] = u.name ?? u.id;
      return acc;
    }, {});
  }
  const result: Record<string, StatusHistoryEntry[]> = {};
  for (const row of rows as { entity_id: string; new_status: string; old_status: string | null; changed_by: string | null; created_at: string }[]) {
    if (!result[row.entity_id]) result[row.entity_id] = [];
    result[row.entity_id].push({
      entity_id: row.entity_id,
      new_status: row.new_status,
      old_status: row.old_status,
      changed_by: row.changed_by,
      changed_by_name: row.changed_by ? (userMap[row.changed_by] ?? null) : null,
      created_at: row.created_at,
    });
  }
  return result;
}

/** 서비스 요청별 @멘션 포함 메모 수 조회 (service_request_id → count) */
export async function getBatchMemoCounts(
  serviceRequestIds: string[]
): Promise<Record<string, number>> {
  if (serviceRequestIds.length === 0) return {};
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('memos')
    .select('entity_id')
    .eq('entity_type', 'service_request')
    .in('entity_id', serviceRequestIds)
    .ilike('content', '%@%');

  if (error) throw error;
  const counts: Record<string, number> = {};
  for (const row of (data || []) as { entity_id: string }[]) {
    counts[row.entity_id] = (counts[row.entity_id] ?? 0) + 1;
  }
  return counts;
}

// 카테고리별 통계
export async function getStatsByCategory() {
  const supabase = getSupabaseOrServer();
  const { data, error } = await supabase
    .from('service_requests')
    .select('category, hq_status');

  if (error) throw error;

  const stats: Record<string, { total: number; completed: number }> = {};

  data?.forEach(req => {
    if (!stats[req.category]) {
      stats[req.category] = { total: 0, completed: 0 };
    }
    stats[req.category].total++;
    if (req.hq_status === 'settlement_done') {
      stats[req.category].completed++;
    }
  });

  return stats;
}
