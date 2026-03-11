import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { notifyPartnerSignupComplete } from '@/lib/notifications';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

function sanitize(value: unknown, maxLen = 500): string {
  if (value == null) return '';
  return String(value).trim().slice(0, maxLen);
}

function mapPartnerInsertError(err: { code?: string; message?: string }): string {
  const code = err.code ?? '';
  const msg = (err.message ?? '').toLowerCase();
  if (code === '23505' || msg.includes('unique') || msg.includes('duplicate')) {
    if (msg.includes('business_number') || msg.includes('사업자')) return '이미 등록된 사업자등록번호입니다.';
    if (msg.includes('user_id')) return '이미 제휴업체로 등록된 계정입니다.';
    return '이미 등록된 정보가 있습니다.';
  }
  if (msg.includes('service_category') || msg.includes('invalid input value')) {
    return '선택한 업종이 올바르지 않습니다.';
  }
  if (msg.includes('foreign key') || msg.includes('violates foreign key')) {
    return '참조 오류가 발생했습니다. 관리자에게 문의해 주세요.';
  }
  return '제휴업체 정보 저장에 실패했습니다.';
}

/** 랜딩 폼 카테고리 → DB service_category enum 매핑 */
const VALID_CATEGORIES = new Set([
  'moving',
  'cleaning',
  'internet_tv',
  'appliance_rental',
  'kiosk',
  'interior',
]);

function validateCategories(categories: string[]): string[] {
  const valid = categories.filter((c) => VALID_CATEGORIES.has(c));
  return [...new Set(valid)];
}

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse('로그인이 필요하거나 권한이 없습니다. 관리자/직원 계정으로 로그인해 주세요.');

  const supabase = createServerClient();
  if (!supabase) {
    const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
    const hasKey = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
    const hint = !hasUrl
      ? 'NEXT_PUBLIC_SUPABASE_URL를 admin-web/.env에 설정하고 개발 서버를 재시작해 주세요.'
      : !hasKey
        ? 'SUPABASE_SERVICE_ROLE_KEY를 admin-web/.env에 설정하고 개발 서버를 재시작해 주세요.'
        : 'Supabase 키 형식을 확인하고 개발 서버를 재시작해 주세요.';
    return NextResponse.json(
      { success: false, error: `서버 설정 오류. ${hint}` },
      { status: 500 }
    );
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    const email = sanitize(body.email, 200).toLowerCase();
    const password = String(body.password ?? '').trim();
    const business_name = sanitize(body.business_name, 200);
    const business_number = sanitize(body.business_number, 50) || null;
    const representative_name = sanitize(body.representative_name, 100) || null;
    const address = sanitize(body.address, 500) || null;
    const contact_phone = sanitize(body.contact_phone, 20) || null;
    const manager_name = sanitize(body.manager_name, 100);
    const manager_phone = sanitize(body.manager_phone, 20) || null;
    const manager_emailRaw = sanitize(body.manager_email, 255);
    const manager_email =
      manager_emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(manager_emailRaw)
        ? manager_emailRaw.trim().toLowerCase()
        : null;
    const rawCategories = Array.isArray(body.service_categories)
      ? (body.service_categories as string[])
      : [];
    const service_categories = validateCategories(rawCategories);

    // Validation
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
    if (!business_name) {
      return NextResponse.json(
        { success: false, error: '업체명을 입력해주세요.' },
        { status: 400 }
      );
    }
    if (service_categories.length === 0) {
      return NextResponse.json(
        { success: false, error: '업종을 1개 이상 선택해주세요.' },
        { status: 400 }
      );
    }

    // 사업자번호 중복 체크 (Auth 유저 생성 전에 수행)
    const bizNumNorm = business_number ? business_number.replace(/\D/g, '') : '';
    if (bizNumNorm.length >= 10) {
      const { data: existing } = await supabase
        .from('partners')
        .select('id')
        .eq('business_number', bizNumNorm)
        .limit(1)
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { success: false, error: '이미 등록된 사업자등록번호입니다.' },
          { status: 400 }
        );
      }
    }

    // 1. Auth 사용자 생성 (user_metadata.role=partner → handle_new_auth_user가 users만 생성, realtors 미생성)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'partner',
        business_name: business_name || undefined,
        manager_name: manager_name || undefined,
        terms_agreed: 'true', // 관리자 직접 등록 시 약관 동의 처리
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

    // auth.users INSERT 시 handle_new_auth_user 트리거가 이미 users 행을 생성함.
    // 중복 키 방지를 위해 upsert 사용.
    const phoneVal = manager_phone || contact_phone;
    const phoneForUsers = phoneVal && /^[0-9\-+\s()]{9,20}$/.test(phoneVal) ? phoneVal : null;
    const { error: userError } = await supabase.from('users').upsert(
      {
        id: userId,
        email,
        name: manager_name || business_name,
        phone: phoneForUsers,
        role: 'partner',
        status: 'active',
      },
      { onConflict: 'id' }
    );

    if (userError) {
      console.error('[admin/partners/signup] users upsert:', userError);
      await supabase.auth.admin.deleteUser(userId).catch((e) => {
        console.error('[admin/partners/signup] 롤백 deleteUser 실패:', e);
        Sentry.captureException(e, {
          tags: { feature: 'partner-signup-rollback', app: 'admin-web' },
          extra: { userId, message: 'users upsert 실패 후 auth 롤백(deleteUser) 실패' },
        });
      });
      const userMsg =
        userError.code === '23505' || (userError.message ?? '').toLowerCase().includes('duplicate')
          ? '이미 등록된 이메일입니다.'
          : '회원 정보 저장에 실패했습니다.';
      return NextResponse.json({ success: false, error: userMsg }, { status: 400 });
    }

    const contactPhoneValid = contact_phone && /^[0-9\-+\s()]{9,20}$/.test(contact_phone) ? contact_phone : null;
    const managerPhoneValid = manager_phone && /^[0-9\-+\s()]{9,20}$/.test(manager_phone) ? manager_phone : null;
    const { error: partnerError } = await supabase.from('partners').insert({
      user_id: userId,
      business_name,
      business_number: bizNumNorm.length >= 10 ? bizNumNorm : business_number,
      representative_name,
      address,
      contact_phone: contactPhoneValid || managerPhoneValid,
      manager_name: manager_name || null,
      manager_phone: managerPhoneValid,
      manager_email,
      service_categories,
    });

    if (partnerError) {
      console.error('[admin/partners/signup] partners insert:', partnerError);
      try {
        await supabase.from('users').delete().eq('id', userId);
      } catch {
        // 롤백: users 행 삭제 실패 시 무시
      }
      try {
        await supabase.auth.admin.deleteUser(userId);
      } catch (e) {
        Sentry.captureException(e, {
          tags: { feature: 'partner-signup-rollback', app: 'admin-web' },
          extra: { userId, message: 'partners insert 실패 후 auth 롤백(deleteUser) 실패' },
        });
      }
      const partnerMsg = mapPartnerInsertError(partnerError);
      return NextResponse.json({ success: false, error: partnerMsg }, { status: 400 });
    }

    // 제휴업체 회원가입 완료 알림 발송 (담당자 휴대폰으로 로그인 안내)
    const recipientPhone = (manager_phone || contact_phone || '').replace(/\s/g, '').replace(/-/g, '');
    if (recipientPhone && recipientPhone.length >= 10) {
      const baseUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
      const loginUrl = baseUrl ? `${baseUrl}/partner` : '/partner';
      await notifyPartnerSignupComplete(
        recipientPhone,
        business_name,
        manager_name || business_name,
        loginUrl
      );
    }

    return NextResponse.json({
      success: true,
      message: '제휴업체 회원가입이 완료되었습니다.',
      userId,
    });
  } catch (e) {
    const err = e as Error & { code?: string; message?: string; details?: string };
    const raw = err?.message ?? String(e);
    const details = err?.details ?? '';
    console.error('[admin/partners/signup]', {
      message: raw,
      code: err?.code,
      details,
      stack: err?.stack,
    });
    let msg = '처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.';
    if (/already been registered|already exists|duplicate/i.test(raw)) msg = '이미 가입된 이메일입니다. 로그인해 주세요.';
    else if (/null value|required|not null|column.*does not exist/i.test(raw)) msg = '필수 정보가 누락되었습니다. 입력값을 확인해 주세요.';
    else if (/foreign key|violates foreign key/i.test(raw)) msg = '관련 데이터 오류가 있습니다. 관리자에게 문의해 주세요.';
    else if (/invalid input value|enum|service_category/i.test(raw)) msg = '선택한 업종이 올바르지 않습니다. 업종을 다시 선택해 주세요.';
    else if (/permission denied|policy|RLS/i.test(raw)) msg = '권한 오류가 발생했습니다. SUPABASE_SERVICE_ROLE_KEY를 확인해 주세요.';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
