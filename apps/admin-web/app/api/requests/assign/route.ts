import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { hasPermission } from '@/lib/permissions';
import { createServerClient } from '@/lib/supabase-server';
import { assignPartnerWithClient } from '@/lib/api/requests';
import { withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const assignBodySchema = z.object({
  requestId: z.string().min(1, 'requestId가 필요합니다.'),
  partnerId: z.string().min(1, 'partnerId가 필요합니다.'),
});

/** 본사 직원 배정 API — 통합 테스트 및 서버 배정용. 권한: staff/admin + requests.assign */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  if (!hasPermission(session.role, 'requests', 'assign')) {
    return forbiddenResponse('배정 권한이 없습니다.');
  }

  const parsed = await parseBody(request, assignBodySchema);
  if (!parsed.ok) return parsed.response;
  const { requestId, partnerId } = parsed.data;

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ success: false, error: '서버 설정 오류' }, { status: 500 });
  }

  await assignPartnerWithClient(supabase, requestId, partnerId, session.userId);
  return NextResponse.json({ success: true });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
