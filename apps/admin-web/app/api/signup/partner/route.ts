/**
 * 제휴업체 셀프 회원가입 API (비로그인 접근 허용)
 * 로그인 페이지에서 "제휴업체 회원가입" 클릭 시 사용
 * - service_role 사용으로 RLS 우회하여 partners insert 가능
 */
import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { notifyPartnerSignupComplete } from '@/lib/notifications';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';
import { captureError } from '@/lib/monitoring';

export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = ['moving', 'cleaning', 'internet_tv', 'appliance_rental', 'kiosk', 'interior'] as const;

const optStr = (maxLen: number, emptyVal: string | null = null) =>
  z.string().optional().transform((s) => (s == null || s === '' ? emptyVal : String(s).trim().slice(0, maxLen) || emptyVal));

const partnerSignupSchema = z.object({
  email: z.string().min(1, '이메일을 입력해주세요.').email('올바른 이메일을 입력해주세요.').transform((s) => s.trim().toLowerCase().slice(0, 200)),
  password: z.string().min(8, '비밀번호는 8자 이상 입력해주세요.').transform((s) => s.trim()),
  business_name: z.string().min(1, '업체명을 입력해주세요.').transform((s) => s.trim().slice(0, 200)),
  business_number: optStr(50, null),
  representative_name: optStr(100, null),
  address: optStr(500, null),
  contact_phone: optStr(20, null),
  manager_name: optStr(100, ''),
  manager_phone: optStr(20, null),
  manager_email: z
    .string()
    .optional()
    .transform((s) => {
      if (!s || typeof s !== 'string') return null;
      const t = s.trim().toLowerCase().slice(0, 255);
      return t && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t) ? t : null;
    }),
  service_categories: z
    .array(z.string())
    .transform((arr) => [...new Set(arr.filter((c) => VALID_CATEGORIES.includes(c as (typeof VALID_CATEGORIES)[number])))])
    .refine((arr) => arr.length >= 1, '업종을 1개 이상 선택해주세요.'),
});

function getSupabaseEnvHint(): string {
  const hasUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasKey =
    Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) ||
    Boolean(process.env.SERVICE_ROLE_KEY?.trim());
  if (!hasUrl) return 'NEXT_PUBLIC_SUPABASE_URL를 admin-web/.env에 설정하고 개발 서버를 재시작해 주세요.';
  if (!hasKey)
    return 'SUPABASE_SERVICE_ROLE_KEY(또는 SERVICE_ROLE_KEY)를 admin-web/.env에 설정하고 개발 서버를 재시작해 주세요.';
  return 'Supabase 키 형식을 확인하고 개발 서버를 재시작해 주세요.';
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

async function postHandler(request: NextRequest) {
  const supabase = createServerClient();
  if (!supabase) {
    throw new ApiError(`서버 설정 오류. ${getSupabaseEnvHint()}`, 500);
  }

  const parsed = await parseBody(request, partnerSignupSchema);
  if (!parsed.ok) return parsed.response;
  const {
    email,
    password,
    business_name,
    business_number,
    representative_name,
    address,
    contact_phone,
    manager_name,
    manager_phone,
    manager_email,
    service_categories,
  } = parsed.data;

  // 사업자번호 중복 체크 (Auth 유저 생성 전에 수행하여 orphan 방지)
  const bizNumNorm = business_number ? business_number.replace(/\D/g, '') : '';
  if (bizNumNorm.length >= 10) {
    const { data: existing } = await supabase
      .from('partners')
      .select('id')
      .eq('business_number', bizNumNorm)
      .limit(1)
      .maybeSingle();
    if (existing) {
      throw new ApiError('이미 등록된 사업자등록번호입니다.', 400);
    }
  }

  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'partner',
        business_name: business_name || undefined,
        manager_name: manager_name || undefined,
      },
    });

  if (authError) {
    const msg =
      authError.message?.includes('already been registered') ||
      authError.message?.includes('already exists')
        ? '이미 가입된 이메일입니다.'
        : /invalid api key|invalid api_key/i.test(authError.message ?? '')
          ? '서버 설정 오류입니다. SUPABASE_SERVICE_ROLE_KEY(또는 SERVICE_ROLE_KEY)를 확인해 주세요.'
          : authError.message || '계정 생성에 실패했습니다.';
    return NextResponse.json(
      { success: false, error: msg, detail: authError.message },
      { status: 400 }
    );
  }

  const userId = authData.user?.id;
  if (!userId) {
    throw new ApiError('계정 생성 중 오류가 발생했습니다.', 500);
  }

  // auth.users INSERT 시 handle_new_auth_user 트리거가 user_metadata.role=partner로 users 행 생성.
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
    await supabase.auth.admin.deleteUser(userId).catch((e) => {
      console.error('[signup/partner] 롤백 deleteUser 실패:', e);
      Sentry.captureException(e, {
        tags: { feature: 'partner-signup-rollback', app: 'admin-web' },
        extra: { userId, message: 'users upsert 실패 후 auth 롤백(deleteUser) 실패' },
      });
    });
    const userMsg =
      userError.code === '23505'
        ? '이미 등록된 이메일로 users에 저장할 수 없습니다.'
        : userError.message?.includes('duplicate') || userError.message?.includes('unique')
          ? '이미 등록된 정보입니다.'
          : '회원 정보 저장에 실패했습니다.';
    return NextResponse.json(
      { success: false, error: userMsg, detail: userError.message, code: userError.code },
      { status: 400 }
    );
  }

  const contactPhoneValid = contact_phone && /^[0-9\-+\s()]{9,20}$/.test(contact_phone) ? contact_phone : null;
  const managerPhoneValid = manager_phone && /^[0-9\-+\s()]{9,20}$/.test(manager_phone) ? manager_phone : null;

  const partnersInsertPayload = {
    user_id: userId,
    business_name,
    business_number: bizNumNorm.length >= 10 ? bizNumNorm : business_number,
    representative_name,
    address,
    contact_phone: contactPhoneValid || managerPhoneValid,
    manager_name: manager_name || null,
    manager_phone: managerPhoneValid,
    manager_email: manager_email || null,
    service_categories,
  };

  const { data: insertedPartner, error: partnerError } = await supabase
    .from('partners')
    .insert(partnersInsertPayload)
    .select('id')
    .single();

  if (partnerError) {
    try {
      await supabase.from('users').delete().eq('id', userId);
    } catch {
      // 롤백: users 행 삭제 실패 시 무시
    }
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (e) {
      captureError(e, { feature: 'partner-signup-rollback', userId, step: 'partners-insert-fail' });
    }
    const partnerMsg = mapPartnerInsertError(partnerError);
    return NextResponse.json(
      {
        success: false,
        error: partnerMsg,
        detail: partnerError.message,
        code: partnerError.code,
      },
      { status: 400 }
    );
  }

  if (!insertedPartner?.id) {
    try {
      await supabase.from('users').delete().eq('id', userId);
    } catch {
      /* no-op */
    }
    try {
      await supabase.auth.admin.deleteUser(userId);
    } catch (e) {
      captureError(e, { feature: 'partner-signup-rollback', userId, step: 'partners-insert-no-id' });
    }
    return NextResponse.json(
      {
        success: false,
        error: '제휴업체 정보 저장 후 확인에 실패했습니다.',
        detail: 'partners insert returned no id',
      },
      { status: 500 }
    );
  }

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
    partnerId: insertedPartner.id,
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
