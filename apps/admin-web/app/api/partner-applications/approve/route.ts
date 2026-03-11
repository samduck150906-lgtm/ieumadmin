import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { sendSms } from '@/lib/alimtalk';
import { sendEmail } from '@/lib/email';
import type { ServiceCategory } from '@/types/database';
import { withErrorHandler } from '@/lib/api/error-handler';

function isValidEmailForSending(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && !trimmed.endsWith('@temp.eum');
}

const CATEGORY_TO_SERVICE: Record<string, ServiceCategory[]> = {
  moving: ['moving'],
  cleaning: ['cleaning'],
  internet: ['internet_tv'],
  interior: ['interior'],
  realtor: [],
  etc: [],
};

function mapApplicationCategory(category: string): ServiceCategory[] {
  return CATEGORY_TO_SERVICE[category] ?? [];
}

function getServiceCategoriesFromApp(app: Record<string, unknown>): ServiceCategory[] {
  const categories: ServiceCategory[] = [];
  if (app.service_moving) categories.push('moving');
  if (app.service_cleaning) categories.push('cleaning');
  if (app.service_internet) categories.push('internet_tv');
  if (app.service_interior) categories.push('interior');
  if (categories.length > 0) return categories;
  return mapApplicationCategory((app.category as string) || '');
}

/** 공인중개사 신청 승인 → realtors 테이블에 계정 생성 (이미 계정이 있으면 상태 업데이트만) */
async function approveAsRealtor(
  supabase: ReturnType<typeof createServerClient>,
  app: Record<string, unknown>,
  userId: string
): Promise<NextResponse> {
  if (!supabase) return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });

  const email = (app.email as string)?.trim() || `realtor_${(app.id as string).replace(/-/g, '')}@temp.eum`;

  // 이미 가입된 계정인지 확인 (랜딩페이지 자가 가입 → 계정이 이미 존재하는 경우)
  const { data: existingUsers } = await supabase
    .from('users')
    .select('id, role')
    .eq('email', email)
    .limit(1);

  const existingUser = existingUsers?.[0];
  let authUserId: string;
  let tempPassword: string | null = null;
  const alreadyRegistered = !!existingUser;

  if (alreadyRegistered) {
    // 이미 계정이 있으면 계정 생성 생략 — 상태만 '승인'으로 업데이트
    authUserId = existingUser.id;
  } else {
    // 신규 계정 생성
    tempPassword = `Temp${Math.random().toString(36).slice(-10)}!`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authError) {
      return NextResponse.json({ success: false, error: `계정 생성 실패: ${authError.message}` }, { status: 500 });
    }
    authUserId = authData.user.id;

    const { error: userErr } = await supabase.from('users').upsert(
      {
        id: authUserId,
        email: app.email || null,
        phone: app.manager_phone || null,
        name: app.manager_name || null,
        role: 'realtor',
        status: 'active',
        force_password_change: true,
      },
      { onConflict: 'id' }
    );
    if (userErr) {
      return NextResponse.json({ success: false, error: `users 저장 실패: ${userErr.message}` }, { status: 500 });
    }

    // 트리거로 생성된 partners 행 제거 (realtor이므로)
    await supabase.from('partners').delete().eq('user_id', authUserId);

    const { error: realtorErr } = await supabase.from('realtors').upsert(
      {
        user_id: authUserId,
        business_name: app.business_name || null,
        office_name: app.business_name || null,
        name: app.manager_name || null,
        phone: (app.manager_phone as string)?.replace(/\D/g, '') || null,
        email: app.email || null,
        address: app.address || null,
      },
      { onConflict: 'user_id' }
    );
    if (realtorErr) {
      return NextResponse.json({ success: false, error: `realtors 저장 실패: ${realtorErr.message}` }, { status: 500 });
    }
  }

  const { error: updateErr } = await supabase
    .from('partner_applications')
    .update({
      status: 'approved',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', app.id as string);
  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
  }

  let smsSent = false;
  const managerPhone = (app.manager_phone as string | undefined)?.replace(/\D/g, '');

  if (alreadyRegistered) {
    // 이미 계정이 있는 경우 — 승인 확인 SMS + 이메일 발송
    if (managerPhone && managerPhone.length >= 10) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ieum.in';
      const smsMessage =
        `[이음] 공인중개사 파트너 가입 승인 안내\n` +
        `안녕하세요, ${app.manager_name}님!\n` +
        `이음 파트너로 승인되었습니다.\n` +
        `앱 다운로드: ${appUrl}`;
      const { success } = await sendSms({ phone: managerPhone, message: smsMessage });
      smsSent = success;
    }
    let emailSent = false;
    const rawEmail = app.email;
    const normalizedEmail =
      typeof rawEmail === 'string' && rawEmail.trim().length > 0 ? rawEmail.trim() : null;
    if (isValidEmailForSending(normalizedEmail)) {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ieum.in';
      const { success } = await sendEmail({
        to: normalizedEmail!,
        subject: '[이음] 공인중개사 파트너 가입 승인 안내',
        text:
          `안녕하세요, ${app.manager_name}님!\n\n` +
          `이음 공인중개사 파트너로 승인되었습니다.\n\n` +
          `이미 가입하신 계정으로 바로 로그인하실 수 있습니다.\n` +
          `앱 다운로드: ${appUrl}\n\n` +
          `감사합니다.`,
      });
      emailSent = success;
    }
    return NextResponse.json({
      success: true,
      type: 'realtor',
      smsSent,
      emailSent,
      alreadyRegistered: true,
      message: '공인중개사 승인 완료. (자가 가입 계정 — 이미 로그인 가능 상태입니다)',
    });
  }

  // 신규 계정 생성 완료 — 임시 비밀번호 SMS + 이메일 발송
  if (managerPhone && managerPhone.length >= 10) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ieum.in';
    const smsMessage =
      `[이음] 공인중개사 파트너 가입 승인 안내\n` +
      `안녕하세요, ${app.manager_name}님!\n` +
      `이음 파트너로 승인되었습니다.\n` +
      `로그인 이메일: ${email}\n` +
      `임시 비밀번호: ${tempPassword}\n` +
      `앱 다운로드: ${appUrl}\n` +
      `로그인 후 비밀번호를 변경해 주세요.`;
    const { success } = await sendSms({ phone: managerPhone, message: smsMessage });
    smsSent = success;
  }

  let emailSent = false;
  const rawEmailRealtor = app.email;
  const normalizedEmailRealtor =
    typeof rawEmailRealtor === 'string' && rawEmailRealtor.trim().length > 0 ? rawEmailRealtor.trim() : null;
  if (isValidEmailForSending(normalizedEmailRealtor)) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://ieum.in';
    const { success } = await sendEmail({
      to: normalizedEmailRealtor!,
      subject: '[이음] 공인중개사 파트너 가입 승인 안내',
      text:
        `안녕하세요, ${app.manager_name}님!\n\n` +
        `이음 공인중개사 파트너로 승인되었습니다.\n\n` +
        `로그인 정보:\n` +
        `- 이메일: ${email}\n` +
        `- 임시 비밀번호: ${tempPassword}\n\n` +
        `앱 다운로드: ${appUrl}\n` +
        `로그인 후 반드시 비밀번호를 변경해 주세요.\n\n` +
        `감사합니다.`,
    });
    emailSent = success;
  }

  const notifyMsg =
    smsSent && emailSent
      ? '공인중개사 승인 완료. SMS 및 이메일로 임시 비밀번호가 발송되었습니다.'
      : smsSent
        ? '공인중개사 승인 완료. 임시 비밀번호가 담당자 휴대폰으로 발송되었습니다.'
        : emailSent
          ? '공인중개사 승인 완료. 임시 비밀번호가 이메일로 발송되었습니다.'
          : `공인중개사 승인 완료. SMS/이메일 발송 실패 — 임시 비밀번호: ${tempPassword} (수동 전달 필요)`;

  return NextResponse.json({
    success: true,
    type: 'realtor',
    smsSent,
    emailSent,
    tempPassword,
    message: notifyMsg,
  });
}

/** 제휴업체 신청 승인 → partners 테이블에 계정 생성 (이미 계정이 있으면 상태 업데이트만) */
async function approveAsPartner(
  supabase: ReturnType<typeof createServerClient>,
  app: Record<string, unknown>,
  userId: string
): Promise<NextResponse> {
  if (!supabase) return NextResponse.json({ success: false, error: '서버 오류' }, { status: 500 });

  const email = (app.email as string)?.trim() || `partner_${(app.id as string).replace(/-/g, '')}@temp.eum`;

  // 이미 가입된 계정인지 확인 (랜딩페이지 자가 가입 → 계정이 이미 존재하는 경우)
  const { data: existingUsers } = await supabase
    .from('users')
    .select('id, role')
    .eq('email', email)
    .limit(1);

  const existingUser = existingUsers?.[0];
  let authUserId: string;
  let tempPassword: string | null = null;
  const alreadyRegistered = !!existingUser;

  if (alreadyRegistered) {
    // 이미 계정이 있으면 계정 생성 생략 — 상태만 '승인'으로 업데이트
    authUserId = existingUser.id;
  } else {
    // 신규 계정 생성
    tempPassword = `Temp${Math.random().toString(36).slice(-10)}!`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });
    if (authError) {
      return NextResponse.json({ success: false, error: `계정 생성 실패: ${authError.message}` }, { status: 500 });
    }
    authUserId = authData.user.id;

    const { error: userErr } = await supabase.from('users').upsert(
      {
        id: authUserId,
        email: app.email || null,
        phone: app.manager_phone || null,
        name: app.manager_name || null,
        role: 'partner',
        status: 'active',
        force_password_change: true,
      },
      { onConflict: 'id' }
    );
    if (userErr) {
      return NextResponse.json({ success: false, error: `users 저장 실패: ${userErr.message}` }, { status: 500 });
    }

    // partner는 realtor가 아니므로 트리거로 생성된 realtors 행 제거
    await supabase.from('realtors').delete().eq('user_id', authUserId);

    const serviceCategories = getServiceCategoriesFromApp(app);

    const { error: partnerErr } = await supabase.from('partners').insert({
      user_id: authUserId,
      business_name: app.business_name,
      business_number: app.business_number || null,
      representative_name: (app.representative_name as string) || app.manager_name || null,
      address: app.address || null,
      contact_phone: app.manager_phone || null,
      manager_name: app.manager_name,
      manager_phone: app.manager_phone,
      service_categories: serviceCategories,
    });
    if (partnerErr) {
      return NextResponse.json({ success: false, error: `partners 저장 실패: ${partnerErr.message}` }, { status: 500 });
    }
  }

  const { error: updateErr } = await supabase
    .from('partner_applications')
    .update({
      status: 'approved',
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', app.id as string);
  if (updateErr) {
    return NextResponse.json({ success: false, error: updateErr.message }, { status: 500 });
  }

  let smsSent = false;
  const managerPhone = (app.manager_phone as string | undefined)?.replace(/\D/g, '');

  if (alreadyRegistered) {
    // 이미 계정이 있는 경우 — 승인 확인 SMS + 이메일 발송
    if (managerPhone && managerPhone.length >= 10) {
      const adminUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum2.netlify.app';
      const smsMessage =
        `[이음 파트너스] 가입 승인 안내\n` +
        `업체명: ${app.business_name}\n` +
        `이미 가입하신 계정으로 바로 로그인하실 수 있습니다.\n` +
        `접속: ${adminUrl}/login`;
      const { success } = await sendSms({ phone: managerPhone, message: smsMessage });
      smsSent = success;
    }
    let emailSent = false;
    const rawEmailPartner = app.email;
    const normalizedEmailPartner =
      typeof rawEmailPartner === 'string' && rawEmailPartner.trim().length > 0 ? rawEmailPartner.trim() : null;
    if (isValidEmailForSending(normalizedEmailPartner)) {
      const adminUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum2.netlify.app';
      const { success } = await sendEmail({
        to: normalizedEmailPartner!,
        subject: '[이음 파트너스] 제휴업체 가입 승인 안내',
        text:
          `안녕하세요, ${app.manager_name}님!\n\n` +
          `업체명: ${app.business_name}\n` +
          `이음 파트너로 승인되었습니다.\n\n` +
          `이미 가입하신 계정으로 바로 로그인하실 수 있습니다.\n` +
          `접속: ${adminUrl}/login\n\n` +
          `감사합니다.`,
      });
      emailSent = success;
    }
    return NextResponse.json({
      success: true,
      type: 'partner',
      smsSent,
      emailSent,
      alreadyRegistered: true,
      message: '제휴업체 승인 완료. (자가 가입 계정 — 이미 로그인 가능 상태입니다)',
    });
  }

  // 신규 계정 생성 완료 — 임시 비밀번호 SMS + 이메일 발송
  if (managerPhone && managerPhone.length >= 10) {
    const adminUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum2.netlify.app';
    const smsMessage =
      `[이음 파트너스] 가입 승인 안내\n` +
      `업체명: ${app.business_name}\n` +
      `로그인 이메일: ${email}\n` +
      `임시 비밀번호: ${tempPassword}\n` +
      `로그인 후 반드시 비밀번호를 변경해 주세요.\n` +
      `접속: ${adminUrl}/login`;
    const { success } = await sendSms({ phone: managerPhone, message: smsMessage });
    smsSent = success;
  }

  let emailSent = false;
  const rawEmailPartnerNew = app.email;
  const normalizedEmailPartnerNew =
    typeof rawEmailPartnerNew === 'string' && rawEmailPartnerNew.trim().length > 0 ? rawEmailPartnerNew.trim() : null;
  if (isValidEmailForSending(normalizedEmailPartnerNew)) {
    const adminUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://ieum2.netlify.app';
    const { success } = await sendEmail({
      to: normalizedEmailPartnerNew!,
      subject: '[이음 파트너스] 제휴업체 가입 승인 안내',
      text:
        `안녕하세요, ${app.manager_name}님!\n\n` +
        `업체명: ${app.business_name}\n` +
        `이음 파트너로 승인되었습니다.\n\n` +
        `로그인 정보:\n` +
        `- 이메일: ${email}\n` +
        `- 임시 비밀번호: ${tempPassword}\n\n` +
        `접속: ${adminUrl}/login\n` +
        `로그인 후 반드시 비밀번호를 변경해 주세요.\n\n` +
        `감사합니다.`,
    });
    emailSent = success;
  }

  const notifyMsg =
    smsSent && emailSent
      ? '제휴업체 승인 완료. SMS 및 이메일로 임시 비밀번호가 발송되었습니다.'
      : smsSent
        ? '제휴업체 승인 완료. 임시 비밀번호가 담당자 휴대폰으로 발송되었습니다.'
        : emailSent
          ? '제휴업체 승인 완료. 임시 비밀번호가 이메일로 발송되었습니다.'
          : `제휴업체 승인 완료. SMS/이메일 발송 실패 — 임시 비밀번호: ${tempPassword} (수동 전달 필요)`;

  return NextResponse.json({
    success: true,
    type: 'partner',
    smsSent,
    emailSent,
    tempPassword,
    message: notifyMsg,
  });
}

async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  try {
    const body = await request.json();
    const { id: applicationId, reviewedBy: userId } = body as { id: string; reviewedBy: string };
    if (!applicationId || !userId) {
      return NextResponse.json({ success: false, error: 'id, reviewedBy 필요' }, { status: 400 });
    }

    const supabase = createServerClient();
    if (!supabase) {
      return NextResponse.json({ success: false, error: '서버 설정 오류. SUPABASE_SERVICE_ROLE_KEY를 확인하세요.' }, { status: 500 });
    }

    const { data: app, error: fetchErr } = await supabase
      .from('partner_applications')
      .select('*')
      .eq('id', applicationId)
      .eq('status', 'pending')
      .single();

    if (fetchErr || !app) {
      return NextResponse.json({ success: false, error: '신청을 찾을 수 없거나 이미 처리되었습니다.' }, { status: 400 });
    }

    // 공인중개사 신청인지 여부 판단
    const isRealtor =
      app.category === 'realtor' ||
      app.service_realtor === true ||
      (Array.isArray(app.service_categories) && app.service_categories.includes('realtor'));

    if (isRealtor) {
      return await approveAsRealtor(supabase, app, userId);
    } else {
      return await approveAsPartner(supabase, app, userId);
    }
  } catch (e) {
    return NextResponse.json(
      { success: false, error: e instanceof Error ? e.message : '승인 처리 중 오류' },
      { status: 500 }
    );
  }
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
