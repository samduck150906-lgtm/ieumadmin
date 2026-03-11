/**
 * 파트너 민원 목록 API - 현재 로그인한 파트너에게 배정된 complaint_logs만 반환
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyPartnerSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export interface PartnerComplaintItem {
  id: string;
  type: string;
  content: string | null;
  status: string;
  created_at: string;
}

async function getHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) return NextResponse.json({ error: '서버 오류' }, { status: 500 });

  const session = await verifyPartnerSession(request);
  const partnerId = session?.partnerId;
  if (!partnerId) return unauthorizedResponse('인증 필요');

  const { data, error } = await supabase
    .from('complaint_logs')
    .select('id, type, content, status, created_at')
    .eq('partner_id', partnerId)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [] });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
