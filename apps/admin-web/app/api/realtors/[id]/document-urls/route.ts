import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { verifySession, verifyStaffSession, unauthorizedResponse, forbiddenResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

const BUCKET = 'realtor-docs';
const SIGNED_URL_EXPIRY_SEC = 3600;

/** realtor-docs 버킷 public URL에서 storage path 추출 (기존 데이터 마이그레이션 없이 signed URL 발급용) */
function extractPathFromPublicUrl(url: string): string | null {
  try {
    // Supabase: .../storage/v1/object/public/realtor-docs/<path> 또는 .../object/sign/realtor-docs/...
    const match = url.match(/\/object\/(?:public|sign)\/realtor-docs\/(.+?)(?:\?|$)/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}

/** 공인중개사 서류(path 또는 기존 public URL) → signed URL 발급. 본인 또는 staff만 호출 가능 */
async function getHandler(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id: realtorId } = await context.params;
  if (!realtorId) {
    return NextResponse.json({ error: 'realtor id 필요' }, { status: 400 });
  }

  const staffSession = await verifyStaffSession(request);
  const session = staffSession ?? (await verifySession(request));

  if (!session) {
    return unauthorizedResponse();
  }

  const serverSupabase = createServerClient();
  if (!serverSupabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const { data: realtor } = await serverSupabase
    .from('realtors')
    .select('id, user_id, id_card_url, bankbook_url, business_license_url')
    .eq('id', realtorId)
    .single();

  if (!realtor) {
    return NextResponse.json({ error: '해당 중개사를 찾을 수 없습니다.' }, { status: 404 });
  }

  const isStaff = !!staffSession;
  const isSelf = session.realtorId === realtorId || session.userId === realtor.user_id;
  if (!isStaff && !isSelf) {
    return forbiddenResponse('본인 또는 관리자만 서류 URL을 조회할 수 있습니다.');
  }

  const signedUrls: Record<string, string> = {};
  const fields = [
    ['id_card_url', realtor.id_card_url],
    ['bankbook_url', realtor.bankbook_url],
    ['business_license_url', realtor.business_license_url],
  ] as const;
  for (const [key, pathOrUrl] of fields) {
    if (typeof pathOrUrl !== 'string') continue;
    if (pathOrUrl.startsWith('realtors/')) {
      const { data } = await serverSupabase.storage.from(BUCKET).createSignedUrl(pathOrUrl, SIGNED_URL_EXPIRY_SEC);
      if (data?.signedUrl) signedUrls[key] = data.signedUrl;
    } else if (pathOrUrl.startsWith('http')) {
      // 버킷 private 전환 후 public URL은 사용 금지. path 추출 가능한 경우에만 signed URL 발급.
      const extractedPath = extractPathFromPublicUrl(pathOrUrl);
      if (extractedPath) {
        const { data } = await serverSupabase.storage.from(BUCKET).createSignedUrl(extractedPath, SIGNED_URL_EXPIRY_SEC);
        if (data?.signedUrl) signedUrls[key] = data.signedUrl;
      }
      // 추출 실패 시 signed URL 미반환 (공개 URL 노출 방지)
    }
  }

  return NextResponse.json(signedUrls);
}

export const GET = (
  request: Request,
  context: { params: Promise<{ id: string }> }
) => withErrorHandler((req: Request) => getHandler(req as NextRequest, context))(request);
