/**
 * 카카오 OAuth 후 공인중개사 추가정보 입력 완료 API
 * - 세션(Bearer 토큰) 필수
 * - realtors 업데이트, QR코드 생성
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

export const dynamic = 'force-dynamic';

const schema = z.object({
  office_name: z.string().min(1, '사무소명을 입력해주세요.').transform((s) => s.trim().slice(0, 200)),
  contact_name: z.string().min(1, '담당자 이름을 입력해주세요.').transform((s) => s.trim().slice(0, 100)),
  contact_phone: z.string().optional().transform((s) => (s?.trim().replace(/-/g, '').slice(0, 20) || null)),
  address: z.string().optional().transform((s) => (s?.trim().slice(0, 500) || null)),
  region: z.string().optional().transform((s) => (s?.trim().slice(0, 100) || null)),
  business_number: z.string().optional().transform((s) => (s?.trim().slice(0, 50) || null)),
});

function getSupabase() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) return null;
  return createClient(url, key);
}

async function postHandler(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    throw new ApiError('서버 설정 오류입니다.', 500);
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    throw new ApiError('로그인 세션이 필요합니다. 카카오 인증 후 다시 시도해 주세요.', 401);
  }
  const token = authHeader.slice(7);
  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) {
    throw new ApiError('인증이 만료되었습니다. 다시 로그인해 주세요.', 401);
  }
  const userId = authUser.id;

  const parsed = await parseBody(request, schema);
  if (!parsed.ok) return parsed.response;
  const { office_name, contact_name, contact_phone, address, business_number } = parsed.data;

  const phoneForUsers = contact_phone && /^[0-9\-+\s()]{9,20}$/.test(contact_phone) ? contact_phone : null;
  await supabase
    .from('users')
    .update({ name: contact_name, phone: phoneForUsers, updated_at: new Date().toISOString() })
    .eq('id', userId);

  const phoneForRealtors = contact_phone && /^[0-9\-+\s()]{9,20}$/.test(contact_phone) ? contact_phone : null;
  const { data: realtorData, error: realtorError } = await supabase
    .from('realtors')
    .upsert(
      {
        user_id: userId,
        business_name: office_name,
        address: address || null,
        contact_name,
        contact_phone: phoneForRealtors,
        business_number: business_number || null,
      },
      { onConflict: 'user_id' }
    )
    .select('id')
    .single();

  if (realtorError || !realtorData) {
    throw new ApiError('공인중개사 정보 저장에 실패했습니다.', 500);
  }

  const { generateRealtorQRCodeServer } = await import('@/lib/qrcode-server');
  const qrUrl = await generateRealtorQRCodeServer(realtorData.id, supabase);
  if (!qrUrl) {
    console.warn('[signup/realtor/kakao-complete] QR코드 자동 생성 실패 (realtorId:', realtorData.id, ')');
  }

  return NextResponse.json({
    success: true,
    message: '공인중개사 등록이 완료되었습니다.',
    realtorId: realtorData.id,
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
