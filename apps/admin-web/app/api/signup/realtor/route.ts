/**
 * 공인중개사 셀프 회원가입 API (비로그인 접근 허용)
 * 로그인 페이지에서 "공인중개사 회원가입" 클릭 시 사용
 */
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createServerClient, getServerClientErrorHint } from '@/lib/supabase';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

const realtorSignupSchema = z.object({
  email: z.string().min(1, '이메일을 입력해주세요.').email('올바른 이메일을 입력해주세요.').transform((s) => s.trim().toLowerCase().slice(0, 200)),
  password: z.string().min(8, '비밀번호는 8자 이상 입력해주세요.').transform((s) => s.trim()),
  office_name: z.string().min(1, '사무소명을 입력해주세요.').transform((s) => s.trim().slice(0, 200)),
  contact_name: z.string().min(1, '담당자 이름을 입력해주세요.').transform((s) => s.trim().slice(0, 100)),
  contact_phone: z.string().optional().transform((s) => (s?.trim().replace(/-/g, '').slice(0, 20) || null)),
  address: z.string().optional().transform((s) => (s?.trim().slice(0, 500) || null)),
  region: z.string().optional().transform((s) => (s?.trim().slice(0, 100) || null)),
  business_number: z.string().optional().transform((s) => (s?.trim().slice(0, 50) || null)),
});

async function postHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    const hint = getServerClientErrorHint();
    throw new ApiError(`서버 설정 오류. ${hint}`, 500);
  }

  const parsed = await parseBody(request, realtorSignupSchema);
  if (!parsed.ok) return parsed.response;
  const { email, password, office_name, contact_name, contact_phone, address, business_number } = parsed.data;

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (authError) {
    const msg =
      authError.message?.includes('already been registered') ||
      authError.message?.includes('already exists')
        ? '이미 가입된 이메일입니다.'
        : /invalid api key|invalid api_key/i.test(authError.message ?? '')
          ? '서버 설정 오류입니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.'
          : authError.message || '계정 생성에 실패했습니다.';
    throw new ApiError(msg, 400);
  }

  const userId = authData.user?.id;
  if (!userId) {
    throw new ApiError('계정 생성 중 오류가 발생했습니다.', 500);
  }

  // auth.users INSERT 시 handle_new_auth_user 트리거가 이미 users/realtors 행을 생성함.
  const phoneForUsers = contact_phone && /^[0-9\-+\s()]{9,20}$/.test(contact_phone) ? contact_phone : null;
  const { error: userError } = await supabase.from('users').upsert(
    {
      id: userId,
      email,
      name: contact_name,
      phone: phoneForUsers,
      role: 'realtor',
      status: 'active',
    },
    { onConflict: 'id' }
  );

  if (userError) {
    await supabase.auth.admin.deleteUser(userId).catch((e) => {
      console.error('[signup/realtor] 롤백 deleteUser 실패:', e);
      Sentry.captureException(e, {
        tags: { feature: 'realtor-signup-rollback', app: 'admin-web' },
        extra: { userId, message: 'users upsert 실패 후 auth 롤백(deleteUser) 실패' },
      });
    });
    throw new ApiError('회원 정보 저장에 실패했습니다.', 500);
  }

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
    try {
      await supabase.from('users').delete().eq('id', userId);
    } catch {
      // no-op
    }
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (e) {
      captureError(e, { feature: 'realtor-signup-rollback', userId, step: 'realtors-insert-fail' });
    }
    throw new ApiError('공인중개사 정보 저장에 실패했습니다.', 500);
  }

  const realtorId = realtorData.id;

  // 가입 즉시 QR코드 자동 생성 (실패해도 가입은 성공 — 사용자에게 안내)
  const { generateRealtorQRCodeServer } = await import('@/lib/qrcode-server');
  const qrUrl = await generateRealtorQRCodeServer(realtorId, supabase);
  if (!qrUrl) {
    console.warn('[signup/realtor] QR코드 자동 생성 실패 (realtorId:', realtorId, ') — 관리자 > 회원관리에서 수동 생성 가능');
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_CUSTOMER_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    'https://ieum-customer.netlify.app';
  const formUrl = `${siteUrl.replace(/\/$/, '')}/form/${realtorId}`;

  return NextResponse.json({
    success: true,
    message: '공인중개사 계정이 성공적으로 생성되었습니다.',
    userId,
    realtorId,
    qrGenerated: !!qrUrl,
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
