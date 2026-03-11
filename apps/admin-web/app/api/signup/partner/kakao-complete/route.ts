/**
 * 카카오 OAuth 후 제휴업체 추가정보 입력 완료 API
 * - 세션(Bearer 토큰) 필수
 * - users.role을 partner로 업데이트, realtors 삭제, partners 생성
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { notifyPartnerSignupComplete } from '@/lib/notifications';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

export const dynamic = 'force-dynamic';

const VALID_CATEGORIES = ['moving', 'cleaning', 'internet_tv', 'appliance_rental', 'kiosk', 'interior'] as const;

const optStr = (maxLen: number, emptyVal: string | null = null) =>
  z.string().optional().transform((s) => (s == null || s === '' ? emptyVal : String(s).trim().slice(0, maxLen) || emptyVal));

const schema = z.object({
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
  const {
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

  const { data: existingPartner } = await supabase
    .from('partners')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existingPartner) {
    return NextResponse.json({ success: true, message: '이미 제휴업체로 등록되어 있습니다.', partnerId: existingPartner.id });
  }

  await supabase.from('realtors').delete().eq('user_id', userId);

  const { error: userError } = await supabase
    .from('users')
    .update({ role: 'partner', name: manager_name || business_name, updated_at: new Date().toISOString() })
    .eq('id', userId);
  if (userError) {
    throw new ApiError('회원 정보 업데이트에 실패했습니다.', 500);
  }

  const contactPhoneValid = contact_phone && /^[0-9\-+\s()]{9,20}$/.test(contact_phone) ? contact_phone : null;
  const managerPhoneValid = manager_phone && /^[0-9\-+\s()]{9,20}$/.test(manager_phone) ? manager_phone : null;

  const { data: insertedPartner, error: partnerError } = await supabase
    .from('partners')
    .insert({
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
    })
    .select('id')
    .single();

  if (partnerError) {
    await supabase.from('users').update({ role: 'realtor' }).eq('id', userId);
    const msg = partnerError.code === '23505' ? '이미 등록된 정보가 있습니다.' : '제휴업체 정보 저장에 실패했습니다.';
    throw new ApiError(msg, 400);
  }

  const recipientPhone = (manager_phone || contact_phone || '').replace(/\s/g, '').replace(/-/g, '');
  if (recipientPhone && recipientPhone.length >= 10) {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '');
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
    partnerId: insertedPartner?.id,
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
