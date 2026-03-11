/**
 * 단순 in-memory rate limiter (단일 인스턴스 기준).
 * 민감 API(리더보드, 로그인 시도 등)에 적용.
 * 배포 시 Redis 등 외부 저장소 연동 권장.
 */

const windowMs = 60 * 1000; // 1분
const maxPerWindow = 60; // 분당 60회

const store = new Map<string, { count: number; resetAt: number }>();

function getKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return ip;
}

export function checkRateLimit(request: Request): { allowed: boolean; retryAfter?: number } {
  const key = getKey(request);
  const now = Date.now();
  let entry = store.get(key);

  if (!entry) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (now >= entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    store.set(key, entry);
    return { allowed: true };
  }

  entry.count += 1;
  if (entry.count > maxPerWindow) {
    return { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true };
}
