/**
 * Toss Payments 환경변수 설정
 * - TOSS_CLIENT_KEY / NEXT_PUBLIC_TOSS_CLIENT_KEY: 클라이언트 키 (브라우저 노출용)
 * - TOSS_SECRET_KEY: 시크릿 키 (서버 전용, 결제 승인 API 호출)
 */

/** 클라이언트 키 (브라우저 SDK 초기화용). NEXT_PUBLIC_ 접두사 필요 */
export function getTossClientKey(): string {
  const key =
    process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY?.trim() ||
    process.env.TOSS_CLIENT_KEY?.trim() ||
    '';
  return key;
}

/** 시크릿 키 (서버 전용, 결제 승인 API 인증용) */
export function getTossSecretKey(): string {
  const key = process.env.TOSS_SECRET_KEY?.trim() || '';
  return key;
}

/** Toss 연동 가능 여부 (클라이언트 키 + 시크릿 키 모두 설정) */
export function isTossConfigured(): boolean {
  if (typeof window !== 'undefined') {
    return Boolean(getTossClientKey());
  }
  return Boolean(getTossClientKey() && getTossSecretKey());
}
