import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod';
import { createWithdrawalRequest, canRequestWithdrawal } from '@/lib/api/settlements';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { ApiError, withErrorHandler } from '@/lib/api/error-handler';
import { parseBody } from '@/lib/api/parse-body';

const withdrawalRequestSchema = z.object({
  amount: z.coerce.number().positive('amount는 0보다 커야 합니다.'),
  bank_name: z.string().min(1, 'bank_name이 필요합니다.').transform((s) => s.trim()),
  account_number: z.string().min(1, 'account_number가 필요합니다.').transform((s) => s.trim()),
  account_holder: z.string().min(1, 'account_holder가 필요합니다.').transform((s) => s.trim()),
});

/** 공인중개사 출금 신청 — 매월 20일부터, 계좌인증 필수 */
async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session) return unauthorizedResponse();

  const realtorId = session.role === 'realtor' ? session.realtorId : null;
  if (!realtorId) {
    throw new ApiError('공인중개사 로그인이 필요합니다.', 403);
  }

  const check = canRequestWithdrawal();
  if (!check.allowed) {
    throw new ApiError(check.message ?? '출금 신청이 불가합니다.', 400);
  }

  const parsed = await parseBody(request, withdrawalRequestSchema);
  if (!parsed.ok) return parsed.response;
  const { amount, bank_name, account_number, account_holder } = parsed.data;

  try {
    await createWithdrawalRequest(realtorId, {
      amount,
      bank_name,
      account_number,
      account_holder,
    });
    return NextResponse.json({ success: true, message: '출금 신청이 접수되었습니다.' });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    Sentry.withScope((scope) => {
      scope.setTag('feature', 'withdrawal-request');
      scope.setTag('app', 'admin-web');
      scope.setUser({ id: realtorId });
      scope.setExtra('amount', amount);
      scope.setExtra('bank_name', bank_name);
      scope.setExtra(
        'account_number_masked',
        account_number ? `****${String(account_number).slice(-4)}` : null
      );
      Sentry.captureException(err);
    });
    throw new ApiError(err.message || '출금 신청 실패', 400);
  }
}

export const POST = withErrorHandler((req: Request) => postHandler(req as NextRequest));

/** 출금 신청 가능 여부 (20일·계좌인증) */
async function getHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor') return unauthorizedResponse();

  const check = canRequestWithdrawal();
  return NextResponse.json({ allowed: check.allowed, message: check.message });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
