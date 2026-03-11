/**
 * 어드민 회원(스태프) 목록 API 테스트
 * GET /api/admin/users — verifyStaffSession 필요
 */
import { NextRequest, NextResponse } from 'next/server';

const mockVerifyStaffSession = jest.fn();
const mockCreateServerClient = jest.fn();

jest.mock('@/lib/auth-middleware', () => ({
  verifyStaffSession: (req: Request) => mockVerifyStaffSession(req),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
}));

jest.mock('@/lib/supabase', () => ({
  createServerClient: () => mockCreateServerClient(),
}));

describe('GET /api/admin/users', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 when no admin session', async () => {
    mockVerifyStaffSession.mockResolvedValue(null);
    const { GET } = await import('@/app/api/admin/users/route');
    const req = new NextRequest('http://localhost/api/admin/users');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('200 with staff list when admin session', async () => {
    mockVerifyStaffSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' });
    mockCreateServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          order: () =>
            Promise.resolve({
              data: [
                {
                  id: 's1',
                  user_id: 'u1',
                  department: '영업',
                  position: '매니저',
                  is_admin: false,
                  can_approve_settlement: true,
                  created_at: '2026-03-01T00:00:00Z',
                  user: {
                    id: 'u1',
                    email: 'staff@test.com',
                    name: '테스트',
                    phone: '01012345678',
                    status: 'active',
                    created_at: '2026-03-01T00:00:00Z',
                    updated_at: '2026-03-01T00:00:00Z',
                  },
                },
              ],
              error: null,
            }),
        }),
      }),
    });
    const { GET } = await import('@/app/api/admin/users/route');
    const req = new NextRequest('http://localhost/api/admin/users');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.meta).toEqual(
      expect.objectContaining({
        total: expect.any(Number),
        page: 1,
        limit: expect.any(Number),
        totalPages: expect.any(Number),
      })
    );
  });
});
