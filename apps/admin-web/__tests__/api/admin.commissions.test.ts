/**
 * 어드민 수수료 목록 API 통합 테스트
 * GET /api/admin/commissions
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

async function importRoute() {
  const mod = await import('@/app/api/admin/commissions/route');
  return mod.GET;
}

function buildRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/admin/commissions');
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url.toString());
}

describe('GET /api/admin/commissions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 when no admin session', async () => {
    mockVerifyStaffSession.mockResolvedValue(null);
    const GET = await importRoute();
    const res = await GET(buildRequest());
    expect(res.status).toBe(401);
  });

  it('500 when createServerClient returns null', async () => {
    mockVerifyStaffSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' });
    mockCreateServerClient.mockReturnValue(null);
    const GET = await importRoute();
    const res = await GET(buildRequest());
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toMatch(/서버 설정|오류|Supabase client init failed/);
  });

  it('200 with paginated data when admin session and query succeeds', async () => {
    mockVerifyStaffSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' });
    const mockRows = [
      {
        id: 'c1',
        realtor_id: 'r1',
        commission_type: 'conversion',
        service_request_id: 'sr1',
        amount: 50000,
        is_settled: false,
        withdrawal_id: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        realtor: { business_name: '테스트 중개사' },
      },
    ];
    const rangeResult = Promise.resolve({ data: mockRows, error: null, count: 1 });
    mockCreateServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => ({
            eq: () => ({ eq: () => ({ range: () => rangeResult }), range: () => rangeResult }),
            range: () => rangeResult,
          }),
        }),
      }),
    });
    const GET = await importRoute();
    const res = await GET(buildRequest({ page: '1', limit: '20' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.meta).toEqual(
      expect.objectContaining({
        page: 1,
        limit: 20,
        totalPages: expect.any(Number),
      })
    );
  });
});
