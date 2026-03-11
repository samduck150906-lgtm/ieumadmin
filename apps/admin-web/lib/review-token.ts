/**
 * 후기 요청 토큰 생성 및 검증
 * - HMAC-SHA256 기반 서명 (서버 비밀키 사용)
 * - 유효기간 7일 (고객이 링크를 늦게 열 수 있음)
 * - DB 저장 불필요 (stateless)
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

const REVIEW_TOKEN_SECRET =
  process.env.REVIEW_TOKEN_SECRET || process.env.SUPABASE_JWT_SECRET || 'ieum-review-default-secret';

const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7일

/** 후기 요청 토큰 생성 */
export function generateReviewToken(serviceRequestId: string): string {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${serviceRequestId}:${expiresAt}`;
  const sig = createHmac('sha256', REVIEW_TOKEN_SECRET).update(payload).digest('hex');
  // base64url 인코딩으로 URL 안전하게
  return Buffer.from(`${payload}:${sig}`).toString('base64url');
}

/** 후기 요청 토큰 검증 */
export function verifyReviewToken(
  token: string,
  serviceRequestId: string
): { valid: boolean; reason?: string } {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8');
    const parts = decoded.split(':');
    if (parts.length < 3) return { valid: false, reason: '토큰 형식 오류' };

    const sig = parts[parts.length - 1];
    const expiresAt = Number(parts[parts.length - 2]);
    const tokenRequestId = parts.slice(0, parts.length - 2).join(':');

    if (tokenRequestId !== serviceRequestId) {
      return { valid: false, reason: '토큰 대상 불일치' };
    }

    if (Math.floor(Date.now() / 1000) > expiresAt) {
      return { valid: false, reason: '토큰 만료 (7일 초과)' };
    }

    const payload = `${tokenRequestId}:${expiresAt}`;
    const expectedSig = createHmac('sha256', REVIEW_TOKEN_SECRET).update(payload).digest('hex');
    const sigBuffer = Buffer.from(sig, 'hex');
    const expectedBuffer = Buffer.from(expectedSig, 'hex');
    if (sigBuffer.length !== expectedBuffer.length || !timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: '서명 불일치' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: '토큰 파싱 실패' };
  }
}
