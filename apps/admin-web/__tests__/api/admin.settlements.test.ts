/**
 * 어드민 정산 목록 API 통합 테스트
 * GET /api/admin/settlements
 */
import { NextRequest, NextResponse } from 'next/server';

const mockVerifyStaffSession = jest.fn();
const mockCreateServerClient = jest.fn();

jest.mock('@/lib/auth-middleware', () => ({
  verifyStaffSession: (req: Request) => mockVerifyStaffSession(req),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
}));

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => mockCreateServerClient(),
}));

async function importRoute() {
  const mod = await import('@/app/api/admin/settlements/route');
  return mod.GET;
}

function buildRequest(searchParams?: Record<string, string>): NextRequest {
  const url = new URL('http://localhost/api/admin/settlements');
  if (searchParams) {
    Object.entries(searchParams).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  return new NextRequest(url.toString());
}

describe('GET /api/admin/settlements', () => {
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
        id: 'wr-1',
        realtor_id: 'r1',
        amount: 100000,
        bank_name: '신한',
        account_number: '110-123',
        account_holder: '홍길동',
        status: 'requested',
        processed_at: null,
        created_at: '2026-03-01T00:00:00Z',
        updated_at: '2026-03-01T00:00:00Z',
        realtor: { business_name: '테스트 중개사' },
      },
    ];
    mockCreateServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => ({
            range: () => Promise.resolve({
              data: mockRows,
              error: null,
              count: 1,
            }),
          }),
        }),
      }),
    });
    const GET = await importRoute();
    const res = await GET(buildRequest({ page: '1', limit: '20' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.data).toHaveLength(1);
    expect(data.data[0].id).toBe('wr-1');
    expect(data.data[0].partnerName).toBe('테스트 중개사');
    expect(data.meta).toEqual(
      expect.objectContaining({
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      })
    );
  });

  it('500 when supabase query returns error', async () => {
    mockVerifyStaffSession.mockResolvedValue({ userId: 'admin-1', role: 'admin' });
    mockCreateServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          order: () => ({
            range: () => Promise.resolve({ data: null, error: { message: 'DB error' }, count: 0 }),
          }),
        }),
      }),
    });
    const GET = await importRoute();
    const res = await GET(buildRequest());
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('DB error');
  });
});
