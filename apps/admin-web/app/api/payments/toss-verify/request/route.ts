/**
 * 토스페이먼츠 1원 계좌 인증 - 요청
 * - 은행코드, 계좌번호, 예금주로 1원 가상계좌 발급
 * - 입금자명에 인증코드 입력 후 입금 → verify API로 검증
 */
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifySession, unauthorizedResponse } from '@/lib/auth-middleware';
import { getTossSecretKey } from '@/lib/toss/config';
import { withErrorHandler } from '@/lib/api/error-handler';
import { withCors } from '@/lib/api/cors';

const TOSS_BASE = 'https://api.tosspayments.com';
const VALID_HOURS = 24;

/** 토스 은행코드 → 은행명 (일부 주요 은행) */
const BANK_CODE_TO_NAME: Record<string, string> = {
  '02': '한국산업은행', '03': 'IBK기업은행', '04': 'KB국민은행', '06': 'KB국민은행',
  '07': 'Sh수협은행', '11': 'NH농협은행', '12': '단위농협', '20': '우리은행',
  '23': 'SC제일은행', '27': '씨티은행', '31': 'iM뱅크(대구)', '32': '부산은행',
  '34': '광주은행', '35': '제주은행', '37': '전북은행', '39': '경남은행',
  '45': '새마을금고', '48': '신협', '50': '저축은행중앙회', '54': '홍콩상하이은행',
  '64': '산림조합', '71': '우체국예금보험', '81': '하나은행', '88': '신한은행',
  '89': '케이뱅크', '90': '카카오뱅크', '92': '토스뱅크',
};

function generateVerificationCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
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

  let body: { bank_code?: string; account_number?: string; holder_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: '요청 본문이 올바르지 않습니다.' },
      { status: 400 }
    );
  }

  const bankCode = String(body?.bank_code ?? '').trim();
  const accountNumber = String(body?.account_number ?? '').replace(/-/g, '').trim();
  const holderName = String(body?.holder_name ?? '').trim();

  if (!bankCode || !accountNumber || !holderName) {
    return NextResponse.json(
      { error: 'bank_code, account_number, holder_name이 모두 필요합니다.' },
      { status: 400 }
    );
  }

  const verificationCode = generateVerificationCode();
  const orderId = `vrf_${session.realtorId}_${verificationCode}_${Date.now()}`;

  const auth = Buffer.from(`${secretKey}:`, 'utf8').toString('base64');
  const res = await fetch(`${TOSS_BASE}/v1/virtual-accounts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${auth}`,
    },
    body: JSON.stringify({
      amount: 1,
      orderId,
      orderName: '계좌인증',
      customerName: holderName,
      validHours: VALID_HOURS,
      bank: '88', // 신한은행 — 토스 가상계좌 발급 가능 은행
    }),
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (data?.message as string) || (data?.code as string) || res.statusText || '가상계좌 발급 실패';
    return NextResponse.json({ error: String(msg) }, { status: res.status >= 500 ? 503 : 400 });
  }

  const va = (data?.virtualAccount as Record<string, unknown>) ?? {};
  const accountNumberVa = (va?.accountNumber as string) ?? '';
  const bankCodeVa = (va?.bankCode as string) ?? '';
  const dueDate = (va?.dueDate as string) ?? '';

  const bankName = BANK_CODE_TO_NAME[bankCode] || bankCode;

  const supabase = createServerClient();
  if (supabase) {
    await supabase
      .from('realtors')
      .update({
        bank_name: bankName,
        account_number: accountNumber,
        account_holder: holderName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', session.realtorId);
  }

  return NextResponse.json({
    success: true,
    order_id: orderId,
    verification_code: verificationCode,
    virtual_account: {
      account_number: accountNumberVa,
      bank_code: bankCodeVa,
      due_date: dueDate,
    },
    amount: 1,
    message: `입금자명에 "${verificationCode}"를 정확히 입력한 뒤 1원을 입금해 주세요.`,
  });
}

export const POST = withCors(withErrorHandler((req: Request) => postHandler(req as NextRequest)));
