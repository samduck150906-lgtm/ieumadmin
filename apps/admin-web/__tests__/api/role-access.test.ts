/**
 * 파트너/스태프/어드민 역할별 접근 제어 회귀 테스트
 * 권한 변경 시 회귀 방지
 */
import { NextRequest, NextResponse } from 'next/server';

const mockVerifySession = jest.fn();
const mockVerifyStaffSession = jest.fn();
const mockVerifyAdminSession = jest.fn();
const mockVerifyPartnerSession = jest.fn();

jest.mock('@/lib/auth-middleware', () => ({
  verifySession: (req: Request) => mockVerifySession(req),
  verifyStaffSession: (req: Request) => mockVerifyStaffSession(req),
  verifyAdminSession: (req: Request) => mockVerifyAdminSession(req),
  verifyPartnerSession: (req: Request) => mockVerifyPartnerSession(req),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  forbiddenResponse: (msg: string) => NextResponse.json({ error: msg }, { status: 403 }),
}));

describe('역할별 접근 제어', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('admin 전용 settlements: 파트너 세션 시 401', async () => {
    mockVerifyAdminSession.mockResolvedValue(null);
    const { GET } = await import('@/app/api/admin/settlements/route');
    const res = await GET(new NextRequest('http://localhost/api/admin/settlements'));
    expect(res.status).toBe(401);
  });

  it('staff 전용 requests/assign: 비인증 시 401', async () => {
    mockVerifyStaffSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/requests/assign/route');
    const res = await POST(
      new NextRequest('http://localhost/api/requests/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: 'r1', partnerId: 'p1' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('partner 전용 db-view-pay: 비파트너 세션 시 401', async () => {
    mockVerifyPartnerSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/partner/db-view-pay/route');
    const res = await POST(
      new NextRequest('http://localhost/api/partner/db-view-pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: 'prop-1' }),
      })
    );
    expect(res.status).toBe(401);
  });

  it('staff 전용 withdrawals/approve: 비인증 시 401', async () => {
    mockVerifyStaffSession.mockResolvedValue(null);
    const { POST } = await import('@/app/api/withdrawals/approve/route');
    const res = await POST(
      new NextRequest('http://localhost/api/withdrawals/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ withdrawalId: 'w1' }),
      })
    );
    expect(res.status).toBe(401);
  });
});
