import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

const BUCKET = 'documents';
const SIGNED_URL_EXPIRY_SEC = 3600;

/** documents 버킷 path → signed URL (staff 전용). 제휴 신청 사업자등록증 등 조회용 */
async function getHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) {
    return unauthorizedResponse();
  }

  const path = request.nextUrl.searchParams.get('path');
  if (!path || path.includes('..')) {
    return NextResponse.json({ error: 'path 쿼리 필요 (상대 경로만)' }, { status: 400 });
  }

  const serverSupabase = createServerClient();
  if (!serverSupabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const { data, error } = await serverSupabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SEC);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data?.signedUrl) {
    return NextResponse.json({ error: 'URL 생성 실패' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
