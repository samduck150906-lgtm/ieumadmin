/**
 * CORS 헤더 유틸 — dashboard-app 등 외부 도메인에서 API 호출 허용
 * 환경변수 CORS_ALLOWED_ORIGINS (쉼표 구분) 또는 DASHBOARD_APP_URL 사용
 */

const DEFAULT_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3001',
  'http://localhost:3002',
  'http://localhost:3003',
  'http://localhost:8081',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:3002',
  'http://127.0.0.1:3003',
  'http://127.0.0.1:8081',
  'https://dashboardapppp.netlify.app',
  'https://mobileappieum.netlify.app',
  'https://ieum2.netlify.app',
  'https://ieum-customer.netlify.app',
  'https://ieum.in',
];

function getAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ALLOWED_ORIGINS?.trim();
  const dashboardUrl = process.env.DASHBOARD_APP_URL?.trim();
  const origins: string[] = [...DEFAULT_ORIGINS];
  if (envOrigins) {
    origins.push(...envOrigins.split(',').map((o) => o.trim()).filter(Boolean));
  }
  if (dashboardUrl) {
    origins.push(dashboardUrl.replace(/\/$/, ''));
  }
  return [...new Set(origins)];
}

/**
 * 요청 Origin이 허용 목록에 있으면 해당 Origin 반환, 없으면 null
 */
export function getAllowedOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) return null;
  const allowed = getAllowedOrigins();
  return allowed.includes(requestOrigin) ? requestOrigin : null;
}

/**
 * CORS 헤더를 NextResponse에 추가
 */
export function addCorsHeaders(
  response: Response,
  request: Request,
  options?: { methods?: string; maxAge?: number }
): Response {
  const origin = getAllowedOrigin(request.headers.get('Origin'));
  if (origin) {
    response.headers.set('Access-Control-Allow-Origin', origin);
  }
  response.headers.set(
    'Access-Control-Allow-Methods',
    options?.methods ?? 'GET, POST, OPTIONS'
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, Accept'
  );
  if (options?.maxAge != null) {
    response.headers.set('Access-Control-Max-Age', String(options.maxAge));
  }
  return response;
}

/**
 * OPTIONS preflight용 204 응답 생성
 */
export function createCorsPreflightResponse(request: Request): Response {
  const res = new Response(null, { status: 204 });
  addCorsHeaders(res, request, { maxAge: 86400 });
  return res;
}

/**
 * API 라우트 핸들러에 CORS 헤더를 추가하는 래퍼
 * - 모바일 앱(localhost:3002, mobileappieum.netlify.app 등)에서 admin API 호출 시 필요
 */
export function withCors<T extends (request: Request) => Promise<Response>>(
  handler: T
): T {
  return (async (request: Request) => {
    const res = await handler(request);
    addCorsHeaders(res, request, { methods: 'GET, POST, PUT, DELETE, OPTIONS' });
    return res;
  }) as T;
}
