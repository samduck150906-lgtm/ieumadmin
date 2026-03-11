/**
 * 제휴업체 메모 추가 — partner_assignment_memos + 본사 통합 memos 테이블 동기화
 * @멘션: 내용에 @ 포함 시 본사 확인요청 표시
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

async function postHandler(request: NextRequest) {
  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  const userId = session?.userId;
  if (!partnerId || !userId) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  let body: { assignmentId: string; memo: string; status_at_time?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { assignmentId, memo, status_at_time } = body;
  if (!assignmentId || !memo?.trim()) {
    return NextResponse.json({ error: 'assignmentId, memo 필요' }, { status: 400 });
  }

  const { data: assignment, error: fetchErr } = await supabase
    .from('partner_assignments')
    .select('id, service_request_id')
    .eq('id', assignmentId)
    .eq('partner_id', partnerId)
    .single();

  if (fetchErr || !assignment) {
    return NextResponse.json({ error: '배정 정보를 찾을 수 없거나 권한이 없습니다.' }, { status: 404 });
  }

  const serviceRequestId = assignment.service_request_id;

  const { error: memoErr } = await supabase.from('partner_assignment_memos').insert({
    assignment_id: assignmentId,
    partner_id: partnerId,
    memo: memo.trim(),
    status_at_time: status_at_time || null,
  });

  if (memoErr) return NextResponse.json({ error: memoErr.message }, { status: 500 });

  // 본사 통합 memos 테이블 동기화 (본사에서도 확인 가능, @멘션 지원)
  const { error: unifiedErr } = await supabase.from('memos').insert({
    entity_type: 'service_request',
    entity_id: serviceRequestId,
    content: memo.trim(),
    created_by: userId,
  });

  if (unifiedErr) {
    // partner_assignment_memos는 성공했으므로 로그만 남기고 200 반환
    console.warn('[partner/memo-add] memos 동기화 실패:', unifiedErr.message);
  }

  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
