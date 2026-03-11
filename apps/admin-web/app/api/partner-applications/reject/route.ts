import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createServerClient } from '@/lib/supabase';
import { verifyStaffSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { sendSms } from '@/lib/alimtalk';
import { sendEmail } from '@/lib/email';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const rejectBodySchema = z.object({
  id: z.string().min(1, 'id가 필요합니다.'),
  reviewedBy: z.string().min(1, 'reviewedBy가 필요합니다.'),
  reason: z.string().min(1, 'reason(반려 사유)가 필요합니다.').transform((s) => s.trim()),
});

/** 가입 신청 반려 — 상태 업데이트 후 신청자에게 SMS 발송 */
async function postHandler(request: NextRequest) {
  const session = await verifyStaffSession(request);
  if (!session) return unauthorizedResponse();

  const parsed = await parseBody(request, rejectBodySchema);
  if (!parsed.ok) return parsed.response;
  const { id: applicationId, reviewedBy: userId, reason } = parsed.data;

  const supabase = createServerClient();
  if (!supabase) {
    throw new ApiError('서버 설정 오류. SUPABASE_SERVICE_ROLE_KEY를 확인하세요.', 500);
  }

  const { data: app, error: fetchErr } = await supabase
    .from('partner_applications')
    .select('id, manager_name, manager_phone, business_name, email, status')
    .eq('id', applicationId)
    .single();

  if (fetchErr || !app) {
    throw new ApiError('신청을 찾을 수 없습니다.', 400);
  }
  if (app.status !== 'pending') {
    throw new ApiError('이미 처리된 신청입니다.', 400);
  }

  const { error: updateErr } = await supabase
    .from('partner_applications')
    .update({
      status: 'rejected',
      reject_reason: reason,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', applicationId);

  if (updateErr) {
    throw new ApiError(updateErr.message, 500);
  }

  let smsSent = false;
  const managerPhone = (app.manager_phone as string | undefined)?.replace(/\D/g, '');
  if (managerPhone && managerPhone.length >= 10) {
    const smsMessage =
      `[이음] 파트너 가입 신청 결과 안내\n` +
      `안녕하세요, ${app.manager_name || '신청자'}님.\n` +
      `이음 파트너 가입 신청이 반려되었습니다.\n` +
      `사유: ${reason}\n` +
      `문의사항이 있으시면 고객센터로 연락 부탁드립니다.`;
    const { success } = await sendSms({ phone: managerPhone, message: smsMessage });
    smsSent = success;
  }

  let emailSent = false;
  const appEmail = (app.email as string | undefined)?.trim();
  if (appEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appEmail) && !appEmail.endsWith('@temp.eum')) {
    const { success } = await sendEmail({
      to: appEmail,
      subject: '[이음] 파트너 가입 신청 결과 안내',
      text:
        `안녕하세요, ${app.manager_name || '신청자'}님.\n\n` +
        `이음 파트너 가입 신청이 반려되었습니다.\n\n` +
        `반려 사유:\n${reason}\n\n` +
        `문의사항이 있으시면 고객센터로 연락 부탁드립니다.\n\n` +
        `감사합니다.`,
    });
    emailSent = success;
  }

  const notifyMsg =
    smsSent && emailSent
      ? '반려 처리되었으며, SMS 및 이메일로 신청자에게 안내했습니다.'
      : smsSent || emailSent
        ? '반려 처리되었으며, 신청자에게 안내했습니다.'
        : '반려 처리되었습니다. (SMS/이메일 발송 실패 — 신청자에게 수동 안내 필요)';

  return NextResponse.json({
    success: true,
    smsSent,
    emailSent,
    message: notifyMsg,
  });
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));
