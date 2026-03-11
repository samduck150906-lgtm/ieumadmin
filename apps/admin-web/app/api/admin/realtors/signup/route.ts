import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerClient, getServerClientErrorHint } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

function sanitize(value: unknown, maxLen = 500): string {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse('로그인이 필요하거나 권한이 없습니다. 관리자/직원 계정으로 로그인해 주세요.');

  const supabase = createServerClient();
  if (!supabase) {
    const hint = getServerClientErrorHint();
    return NextResponse.json(
      { success: false, error: `서버 설정 오류. ${hint}` },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const email = sanitize(body.email, 200).toLowerCase();
    const password = String(body.password ?? '').trim();
    const office_name = sanitize(body.office_name, 200);
    const contact_name = sanitize(body.contact_name, 100);
    const contact_phone = sanitize(body.contact_phone, 20).replace(/-/g, '') || null;
    const address = sanitize(body.address, 500) || null;
    const region = sanitize(body.region, 100) || null;
    const business_number = sanitize(body.business_number, 50) || null;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json(
        { success: false, error: '올바른 이메일을 입력해주세요.' },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        { success: false, error: '비밀번호는 8자 이상 입력해주세요.' },
        { status: 400 }
      );
    }
    if (!office_name) {
      return NextResponse.json(
        { success: false, error: '사무소명을 입력해주세요.' },
        { status: 400 }
      );
    }
    if (!contact_name) {
      return NextResponse.json(
        { success: false, error: '담당자 이름을 입력해주세요.' },
        { status: 400 }
      );
    }

    // 1. Auth 사용자 생성 (handle_new_auth_user 트리거가 users/realtors 생성)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'realtor',
        business_name: office_name,
        contact_name,
        contact_phone: contact_phone || undefined,
      },
    });

    if (authError) {
      const msg =
        authError.message?.includes('already been registered') ||
        authError.message?.includes('already exists')
          ? '이미 가입된 이메일입니다.'
          : /invalid api key|invalid api_key/i.test(authError.message ?? '')
            ? '서버 설정 오류입니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.'
            : authError.message || '계정 생성에 실패했습니다.';
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    const userId = authData.user?.id;
    if (!userId) {
      return NextResponse.json(
        { success: false, error: '계정 생성 중 오류가 발생했습니다.' },
        { status: 500 }
      );
    }

    // auth.users INSERT 시 handle_new_auth_user 트리거가 이미 users/realtors 행을 생성함.
    // 중복 키 방지를 위해 upsert 사용.
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
      console.error('[admin/realtors/signup] users upsert:', userError);
      await supabase.auth.admin.deleteUser(userId).catch((e) => {
        console.error('[admin/realtors/signup] 롤백 deleteUser 실패:', e);
        Sentry.captureException(e, {
          tags: { feature: 'realtor-signup-rollback', app: 'admin-web' },
          extra: { userId, message: 'users upsert 실패 후 auth 롤백(deleteUser) 실패' },
        });
      });
      return NextResponse.json(
        { success: false, error: '회원 정보 저장에 실패했습니다.' },
        { status: 500 }
      );
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
      console.error('[admin/realtors/signup] realtors insert:', realtorError);
      try {
        await supabase.from('users').delete().eq('id', userId);
      } catch (e) {
        console.error('[admin/realtors/signup] 롤백 users delete 실패:', e);
      }
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (e) {
        Sentry.captureException(e, {
          tags: { feature: 'realtor-signup-rollback', app: 'admin-web' },
          extra: { userId, message: 'realtors insert 실패 후 auth 롤백(deleteUser) 실패' },
        });
      }
      return NextResponse.json(
        { success: false, error: '공인중개사 정보 저장에 실패했습니다.' },
        { status: 500 }
      );
    }

    const realtorId = realtorData.id;

    // 4. 가입 즉시 QR코드 자동 생성 (실패해도 가입은 성공)
    const { generateRealtorQRCodeServer } = await import('@/lib/qrcode-server');
    const qrUrl = await generateRealtorQRCodeServer(realtorId, supabase);
    if (!qrUrl) {
      console.warn('[admin/realtors/signup] QR코드 자동 생성 실패 (realtorId:', realtorId, ')');
    }

    return NextResponse.json({
      success: true,
      message: '공인중개사 계정이 성공적으로 생성되었습니다.',
      userId,
      realtorId,
      qrGenerated: !!qrUrl,
    });
  } catch (e) {
    const err = e as Error & { code?: string; message?: string; details?: string };
    const raw = err?.message ?? String(e);
    const details = err?.details ?? '';
    console.error('[admin/realtors/signup]', {
      message: raw,
      code: err?.code,
      details,
      stack: err?.stack,
    });
    let msg = '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    if (/already been registered|already exists|duplicate/i.test(raw)) msg = '이미 가입된 이메일입니다. 로그인해 주세요.';
    else if (/null value|required|not null|column.*does not exist/i.test(raw)) msg = '필수 정보가 누락되었습니다. 입력값을 확인해 주세요.';
    else if (/foreign key|violates foreign key/i.test(raw)) msg = '관련 데이터 오류가 있습니다. 관리자에게 문의해 주세요.';
    else if (/invalid input value|enum/i.test(raw)) msg = '입력값 형식이 올바르지 않습니다. 확인 후 다시 시도해 주세요.';
    else if (/permission denied|policy|RLS/i.test(raw)) msg = '권한 오류가 발생했습니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
