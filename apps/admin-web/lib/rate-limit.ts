/**
 * 단순 in-memory rate limiter.
 * 서버리스에서는 인스턴스별로 적용되며, 다중 인스턴스 시 각자 제한만 적용됨.
 * 프로덕션 대규모 트래픽 시 Redis/Upstash 등 외부 저장소 사용 권장.
 */

type Window = { count: number; resetAt: number };

const windows = new Map<string, Window>();

/** 주기적으로 만료된 키 정리 (메모리 누수 방지) */
function prune(): void {
  const now = Date.now();
  for (const [key, w] of Array.from(windows.entries())) {
    if (w.resetAt <= now) windows.delete(key);
  }
}
if (typeof setInterval !== 'undefined') {
  setInterval(prune, 60 * 1000);
}

export interface RateLimitOptions {
  /** 구간(ms). 기본 15분 */
  windowMs?: number;
  /** 구간 내 최대 요청 수 */
  max: number;
}

/**
 * @param key 식별자 (예: IP, userId)
 * @param options max, windowMs
 * @returns { allowed: boolean, remaining: number, retryAfterMs?: number }
 */
export function checkRateLimit(
  key: string,
  options: RateLimitOptions
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const max = options.max;
  const now = Date.now();
  let w = windows.get(key);

  if (!w) {
    w = { count: 1, resetAt: now + windowMs };
    windows.set(key, w);
    return { allowed: true, remaining: max - 1 };
  }

  if (now >= w.resetAt) {
    w = { count: 1, resetAt: now + windowMs };
    windows.set(key, w);
    return { allowed: true, remaining: max - 1 };
  }

  w.count += 1;
  const remaining = Math.max(0, max - w.count);
  if (w.count > max) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: w.resetAt - now,
    };
  }
  return { allowed: true, remaining };
}

/** 요청에서 클라이언트 식별자 추출 (IP). Vercel/Netlify 등 x-forwarded-for 지원 */
export function getClientIdentifier(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = (forwarded?.split(',')[0]?.trim() || realIp || 'unknown').slice(0, 64);
  return `ip:${ip}`;
}
