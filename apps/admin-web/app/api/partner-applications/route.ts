/**
 * 제휴업체·공인중개사 가입 신청 목록 조회 (관리자 전용)
 * 랜딩 페이지 제휴사 신청이 partner_applications에 저장되면 여기서 조회되어 '승인 대기'에 표시됨.
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import type { PartnerApplication } from '@/types/database';
import { withErrorHandler } from '@/lib/api/error-handler';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) {
    return unauthorizedResponse('관리자 로그인이 필요합니다.');
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json(
      { error: '서버 설정을 확인할 수 없습니다.' },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') as 'pending' | 'approved' | 'rejected' | null;
  const category = searchParams.get('category') as 'realtor' | 'partner' | null; // 공인중개사/제휴업체 탭 필터
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, parseInt(searchParams.get('limit') ?? String(DEFAULT_LIMIT), 10))
  );

  let query = supabase
    .from('partner_applications')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * limit, page * limit - 1);

  if (status && ['pending', 'approved', 'rejected'].includes(status)) {
    query = query.eq('status', status);
  }

  // 공인중개사/제휴업체 탭별 필터 (서버 사이드)
  if (category === 'realtor') {
    query = query.or('category.eq.realtor,service_realtor.eq.true');
  } else if (category === 'partner') {
    query = query.or('category.neq.realtor,category.is.null').or('service_realtor.neq.true,service_realtor.is.null');
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json(
      { error: '신청 목록을 불러오지 못했습니다.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    data: (data ?? []) as PartnerApplication[],
    total: count ?? 0,
    totalPages: Math.ceil((count ?? 0) / limit),
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
