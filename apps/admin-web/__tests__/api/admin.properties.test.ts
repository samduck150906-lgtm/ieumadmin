/**
 * 어드민 매물 목록 API 통합 테스트
 * GET /api/admin/properties — verifyStaffSession, createServerClient 필요
 * createServerClient 모킹: admin.users.test.ts와 동일 방식. 환경변수 의존 없음.
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

/** properties API용 Supabase 체인: from → select → order → range */
const defaultSupabaseChain = {
  from: () => ({
    select: () => ({
      order: () => ({
        or: () => ({ range: () => Promise.resolve({ data: [], error: null, count: 0 }) }),
        eq: () => ({ range: () => Promise.resolve({ data: [], error: null, count: 0 }) }),
        range: () => Promise.resolve({ data: [], error: null, count: 0 }),
      }),
    }),
  }),
};

describe('GET /api/admin/properties', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateServerClient.mockReturnValue(defaultSupabaseChain);
  });

  it('401 when no admin session', async () => {
    mockVerifyStaffSession.mockResolvedValue(null);
    const { GET } = await import('@/app/api/admin/properties/route');
    const req = new NextRequest('http://localhost/api/admin/properties');
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('200 with empty data and meta when admin session', async () => {
    mockVerifyStaffSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' });
    const { GET } = await import('@/app/api/admin/properties/route');
    const req = new NextRequest('http://localhost/api/admin/properties?page=1&limit=20');
    const res = await GET(req);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toEqual([]);
    expect(data.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      hasNext: false,
      hasPrev: false,
    });
  });
});
