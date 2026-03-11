/**
 * PUT /api/user/profile — 인증 필요(로그인 게이트) 검증
 */
import { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const mockVerifySession = jest.fn();

jest.mock('@/lib/auth-middleware', () => ({
  verifySession: (req: NextRequest) => mockVerifySession(req),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
}));

async function importRoute() {
  const mod = await import('@/app/api/user/profile/route');
  return mod.PUT;
}

function buildRequest(body: unknown = {}): NextRequest {
  return new NextRequest('http://localhost/api/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PUT /api/user/profile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 when no session', async () => {
    mockVerifySession.mockResolvedValue(null);
    const PUT = await importRoute();
    const res = await PUT(buildRequest({ name: '테스트' }));
    expect(res.status).toBe(401);
  });

  it('401 when session role is not realtor', async () => {
    mockVerifySession.mockResolvedValue({ userId: 'u1', role: 'staff' });
    const PUT = await importRoute();
    const res = await PUT(buildRequest({ name: '테스트' }));
    expect(res.status).toBe(401);
  });
});
