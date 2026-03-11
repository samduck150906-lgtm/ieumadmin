import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { maskApiKey } from '@/lib/masking';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * 시스템 설정 현황 조회 (관리자 전용)
 * - 키/시크릿은 마스킹하여 반환 (••••••••끝4자)
 * - 저장 방식: 서버 환경변수(.env / Vercel 등) — UI에서 수정 불가
 */
async function getHandler(request: NextRequest) {
  const session = await verifyAdminSession(request);
  if (!session) return unauthorizedResponse();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const aligoKey = process.env.ALIGO_API_KEY;
  const aligoUserId = process.env.ALIGO_USER_ID;
  const aligoSender = process.env.ALIGO_SENDER;
  const kakaoRestKey = process.env.KAKAO_REST_API_KEY;
  const kakaoSenderKey = process.env.KAKAO_SENDER_KEY;
  const paymentProvider = (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase();
  const paymentSecret = process.env.PAYMENT_SESSION_SECRET;
  const sentryDsn = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

  return NextResponse.json({
    storage: 'env',
    storageNote:
      '모든 키는 서버 환경변수(.env 또는 배포 플랫폼 환경변수)에만 저장됩니다. 이 화면에서는 값을 수정할 수 없으며, 마스킹된 상태만 표시됩니다.',
    config: {
      api: {
        supabase: {
          configured: !!(supabaseUrl && supabaseKey),
          urlMasked: supabaseUrl ? `${supabaseUrl.slice(0, 30)}…` : '미설정',
          keyMasked: maskApiKey(supabaseKey),
        },
        sentry: {
          configured: !!sentryDsn,
          dsnMasked: maskApiKey(sentryDsn),
        },
      },
      pg: {
        provider: paymentProvider === 'toss' ? 'toss' : 'mock',
        configured: !!paymentSecret && paymentSecret !== 'dev-change-me-immediately',
        secretMasked: maskApiKey(paymentSecret),
      },
      sms: {
        aligo: {
          configured: !!(aligoKey && aligoUserId),
          apiKeyMasked: maskApiKey(aligoKey),
          userIdMasked: maskApiKey(aligoUserId),
          sender: aligoSender ? `${aligoSender.slice(0, 4)}***` : '미설정',
        },
        kakao: {
          configured: !!(kakaoRestKey && kakaoSenderKey),
          restKeyMasked: maskApiKey(kakaoRestKey),
          senderKeyMasked: maskApiKey(kakaoSenderKey),
        },
      },
      email: {
        configured: !!(process.env.RESEND_API_KEY || process.env.SMTP_HOST),
        note: 'RESEND_API_KEY 또는 SMTP 관련 환경변수 사용 시 표시됩니다.',
      },
    },
  });
}

export const GET = withErrorHandler((request: Request) => getHandler(request as NextRequest));
