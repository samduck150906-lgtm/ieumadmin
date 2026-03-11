/**
 * 토스페이먼츠 1원 계좌 인증 - 검증
 * - orderId로 결제 조회 → 입금 완료 시 depositorName과 인증코드 일치 확인
 * - 성공 시 realtor의 account_verified, bank_name, account_number, account_holder 업데이트
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { getTossSecretKey } from '@/lib/toss/config';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

const TOSS_BASE = 'https://api.tosspayments.com';

function parseVerifyOrderId(orderId: string): { realtorId: string; verificationCode: string } | null {
  const match = /^vrf_(.+)_(\d{4})_\d+$/.exec(orderId);
  if (!match) return null;
  return { realtorId: match[1], verificationCode: match[2] };
}

async function postHandler(request: NextRequest) {
  const session = await verifySession(request);
  if (!session || session.role !== 'realtor' || !session.realtorId) {
    return unauthorizedResponse('공인중개사 로그인이 필요합니다.');
  }

  const secretKey = getTossSecretKey();
  if (!secretKey) {
    return NextResponse.json(
      { error: 'TOSS_SECRET_KEY가 설정되지 않았습니다.' },
      { status: 503 }
    );
  }

  let body: { order_id?: string; verification_code?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: '요청 본문이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  const orderId = String(body?.order_id ?? '').trim();
  const verificationCode = String(body?.verification_code ?? '').trim();

  if (!orderId || !verificationCode) {
    return NextResponse.json(
      { error: 'order_id, verification_code가 필요합니다.' },
      { status: 400 }
    );
  }

  const parsed = parseVerifyOrderId(orderId);
  if (!parsed || parsed.realtorId !== session.realtorId) {
    return NextResponse.json(
      { error: '유효하지 않은 인증 요청입니다.' },
      { status: 400 }
    );
  }

  if (parsed.verificationCode !== verificationCode) {
    return NextResponse.json(
      { error: '인증코드가 일치하지 않습니다.' },
      { status: 400 }
    );
  }

  const auth = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  const res = await fetch(`${TOSS_BASE}/v1/payments/orders/${encodeURIComponent(orderId)}`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  });

  const payment = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (payment?.message as string) || (payment?.code as string) || '결제 조회 실패';
    return NextResponse.json({ error: String(msg) }, { status: res.status >= 500 ? 503 : 400 });
  }

  const status = payment?.status as string;
  if (status !== 'DONE') {
    return NextResponse.json(
      { error: '아직 입금이 완료되지 않았습니다. 입금 후 다시 확인해 주세요.' },
      { status: 400 }
    );
  }

  const va = (payment?.virtualAccount as Record<string, unknown>) ?? {};
  const depositorName = String(va?.depositorName ?? '').trim();

  if (depositorName !== verificationCode) {
    return NextResponse.json(
      { error: '입금자명이 인증코드와 일치하지 않습니다. 입금자명을 확인해 주세요.' },
      { status: 400 }
    );
  }

  const supabase = createServerClient();
  if (!supabase) {
    return NextResponse.json({ error: '서버 설정 오류' }, { status: 500 });
  }

  const { data: realtor } = await supabase
    .from('realtors')
    .select('id, bank_name, account_number, account_holder')
    .eq('id', session.realtorId)
    .single();

  if (!realtor) {
    return NextResponse.json({ error: '공인중개사 정보를 찾을 수 없습니다.' }, { status: 404 });
  }

  const bankName = (realtor.bank_name as string) ?? '';
  const accountNumber = (realtor.account_number as string) ?? '';
  const accountHolder = (realtor.account_holder as string) ?? '';

  const updatePayload: Record<string, unknown> = {
    account_verified: true,
    updated_at: new Date().toISOString(),
  };

  if (bankName || accountNumber || accountHolder) {
    updatePayload.bank_name = bankName;
    updatePayload.account_number = accountNumber;
    updatePayload.account_holder = accountHolder;
  }

  const { error: updateError } = await supabase
    .from('realtors')
    .update(updatePayload)
    .eq('id', session.realtorId);

  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || '계좌 인증 반영에 실패했습니다.' },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    account_verified: true,
    message: '계좌 인증이 완료되었습니다.',
  });
}

export const POST = withCors(withErrorHandler((req: Request) => postHandler(req as NextRequest)));
