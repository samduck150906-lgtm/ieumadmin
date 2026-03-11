/**
 * 어드민 주요 플로우 통합 검증: 인증 게이트 → 배정 → 정산
 * 각 단계별 API를 순차 호출하여 권한·성공 응답을 검증합니다.
 */
import { NextRequest, NextResponse } from 'next/server';

const mockVerifySession = jest.fn();
const mockVerifyStaffSession = jest.fn();
const mockVerifyAdminSession = jest.fn();
const mockCreateServerClient = jest.fn();
const mockAssignPartnerWithClient = jest.fn();

jest.mock('@/lib/auth-middleware', () => ({
  verifySession: (req: Request) => mockVerifySession(req),
  verifyStaffSession: (req: Request) => mockVerifyStaffSession(req),
  verifyAdminSession: (req: Request) => mockVerifyAdminSession(req),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  forbiddenResponse: (msg: string) => NextResponse.json({ error: msg }, { status: 403 }),
}));

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => mockCreateServerClient(),
}));

jest.mock('@/lib/api/requests', () => ({
  assignPartnerWithClient: (...args: unknown[]) => mockAssignPartnerWithClient(...args),
}));

describe('어드민 플로우: 로그인 → 배정 → 정산', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('1단계: 비인증 시 프로필 API 401', async () => {
    mockVerifySession.mockResolvedValue(null);
    const { PUT } = await import('@/app/api/user/profile/route');
    const req = new NextRequest('http://localhost/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const res = await PUT(req);
    expect(res.status).toBe(401);
  });

  it('2단계: 스태프 세션으로 배정 API 200', async () => {
    mockVerifyStaffSession.mockResolvedValue({ userId: 'staff-1', role: 'staff' });
    const mockSupabase = {};
    mockCreateServerClient.mockReturnValue(mockSupabase);
    mockAssignPartnerWithClient.mockResolvedValue(undefined);

    const { POST } = await import('@/app/api/requests/assign/route');
    const req = new NextRequest('http://localhost/api/requests/assign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: 'req-1', partnerId: 'partner-1' }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockAssignPartnerWithClient).toHaveBeenCalledWith(
      mockSupabase,
      'req-1',
      'partner-1',
      'staff-1'
    );
  });

  it('3단계: 어드민 세션으로 정산 목록 API 200', async () => {
    mockVerifyAdminSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' });
    mockCreateServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => ({
            range: () =>
              Promise.resolve({
                data: [],
                error: null,
                count: 0,
              }),
          }),
        }),
      }),
    });

    const { GET } = await import('@/app/api/admin/settlements/route');
    const req = new NextRequest('http://localhost/api/admin/settlements');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual([]);
    expect(data.meta).toBeDefined();
  });
});
