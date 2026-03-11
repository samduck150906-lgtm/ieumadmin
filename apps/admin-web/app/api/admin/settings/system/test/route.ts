import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { verifyAdminSession, unauthorizedResponse } from '@/lib/auth-middleware';
import { withErrorHandler } from '@/lib/api/error-handler';

export const dynamic = 'force-dynamic';

/**
 * 시스템 연동 연결 테스트 (관리자 전용)
 * POST /api/admin/settings/system/test
 * - Supabase: DB 연결 확인
 * - SMS(알리고): 잔여건수 API로 키 유효성 확인 (문자 발송 없음)
 * - PG: 환경 설정 여부만 확인 (실제 결제 호출 없음)
 */
async function postHandler(request: NextRequest) {
  const session = await verifyAdminSession(request);
  if (!session) return unauthorizedResponse();

  const results: {
    supabase: { ok: boolean; message?: string };
    sms: { ok: boolean; message?: string };
    pg: { ok: boolean; message?: string };
  } = {
    supabase: { ok: false },
    sms: { ok: false },
    pg: { ok: false },
  };

  // 1. Supabase 연결 테스트
  const supabase = createServerClient();
  if (supabase) {
    try {
      const { error } = await supabase.from('staff').select('id').limit(1);
      results.supabase = error ? { ok: false, message: error.message } : { ok: true };
    } catch (e) {
      results.supabase = { ok: false, message: e instanceof Error ? e.message : '연결 실패' };
    }
  } else {
    results.supabase = { ok: false, message: 'Supabase 환경변수 미설정' };
  }

  // 2. SMS(알리고) 연결 테스트 — 잔여건수 API 호출 (문자 발송 없음)
  const aligoKey = process.env.ALIGO_API_KEY;
  const aligoUserId = process.env.ALIGO_USER_ID;
  if (!aligoKey || !aligoUserId) {
    results.sms = { ok: false, message: 'ALIGO_API_KEY, ALIGO_USER_ID 미설정' };
  } else {
    try {
      const form = new URLSearchParams({
        key: aligoKey,
        userid: aligoUserId,
      });
      const res = await fetch('https://apis.aligo.in/remain/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
      });
      const data = (await res.json()) as { result_code?: string; message?: string };
      const code = String(data.result_code ?? '');
      if (code === '1') {
        results.sms = { ok: true };
      } else {
        results.sms = { ok: false, message: data.message || `result_code: ${code}` };
      }
    } catch (e) {
      results.sms = { ok: false, message: e instanceof Error ? e.message : 'API 요청 실패' };
    }
  }

  // 3. PG — 설정 여부만 확인 (실제 결제 호출 없음)
  const paymentSecret = process.env.PAYMENT_SESSION_SECRET;
  const paymentProvider = (process.env.PAYMENT_PROVIDER || 'mock').trim().toLowerCase();
  const isProd = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (!paymentSecret || (isProd && paymentSecret === 'dev-change-me-immediately')) {
    results.pg = { ok: false, message: 'PAYMENT_SESSION_SECRET 미설정 또는 기본값 사용' };
  } else {
    results.pg = {
      ok: true,
      message: paymentProvider === 'toss' ? '토스 연동 설정됨 (실결제 테스트는 결제 플로우에서 확인)' : 'Mock 모드 설정됨',
    };
  }

  return NextResponse.json({ results });
}

export const POST = withErrorHandler((request: Request) => postHandler(request as NextRequest));
