/**
 * 본사 배정 API 통합 테스트 — 운영급 핵심 mutation
 * POST /api/requests/assign
 */
import { NextResponse } from 'next/server';

const mockVerifyStaffSession = jest.fn();
const mockAssignPartnerWithClient = jest.fn();
const mockCreateServerClient = jest.fn();

jest.mock('@/lib/auth-middleware', () => ({
  verifyStaffSession: (req: Request) => mockVerifyStaffSession(req),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  forbiddenResponse: (msg: string) => NextResponse.json({ error: msg }, { status: 403 }),
}));

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => mockCreateServerClient(),
}));

jest.mock('@/lib/api/requests', () => ({
  assignPartnerWithClient: (...args: unknown[]) => mockAssignPartnerWithClient(...args),
}));

async function importRoute() {
  const mod = await import('@/app/api/requests/assign/route');
  return mod.POST;
}

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/requests/assign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/requests/assign', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 when no auth', async () => {
    mockVerifyStaffSession.mockResolvedValue(null);
    const POST = await importRoute();
    const res = await POST(buildRequest({ requestId: 'req-1', partnerId: 'partner-1' }));
    expect(res.status).toBe(401);
  });

  it('403 when role has no assign permission', async () => {
    mockVerifyStaffSession.mockResolvedValue({ userId: 'u1', role: 'partner' });
    const POST = await importRoute();
    const res = await POST(buildRequest({ requestId: 'req-1', partnerId: 'partner-1' }));
    expect(res.status).toBe(403);
  });

  it('400 when requestId or partnerId missing', async () => {
    mockVerifyStaffSession.mockResolvedValue({
      userId: 'staff-1',
      role: 'staff',
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({ requestId: 'req-1' }));
    expect(res.status).toBe(400);
  });

  it('500 when createServerClient returns null', async () => {
    mockVerifyStaffSession.mockResolvedValue({
      userId: 'staff-1',
      role: 'staff',
    });
    mockCreateServerClient.mockReturnValue(null);
    const POST = await importRoute();
    const res = await POST(buildRequest({ requestId: 'req-1', partnerId: 'partner-1' }));
    expect(res.status).toBe(500);
  });

  it('200 when staff and assign succeeds', async () => {
    mockVerifyStaffSession.mockResolvedValue({
      userId: 'staff-1',
      role: 'staff',
    });
    const mockSupabase = {};
    mockCreateServerClient.mockReturnValue(mockSupabase);
    mockAssignPartnerWithClient.mockResolvedValue(undefined);
    const POST = await importRoute();
    const res = await POST(buildRequest({ requestId: 'req-1', partnerId: 'partner-1' }));
    expect(res.status).toBe(200);
    expect(mockAssignPartnerWithClient).toHaveBeenCalledWith(
      mockSupabase,
      'req-1',
      'partner-1',
      'staff-1'
    );
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
