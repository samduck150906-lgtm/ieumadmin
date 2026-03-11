/**
 * 출금 승인 API 통합 테스트 — 운영급 핵심 mutation
 * POST /api/withdrawals/approve
 */
import { NextResponse } from 'next/server';

const mockVerifyStaffSession = jest.fn();
const mockCreateServerClient = jest.fn();
const mockParseBody = jest.fn();

jest.mock('@/lib/auth-middleware', () => ({
  verifyStaffSession: (req: Request) => mockVerifyStaffSession(req),
  unauthorizedResponse: () => NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  forbiddenResponse: (msg: string) => NextResponse.json({ error: msg }, { status: 403 }),
}));

jest.mock('@/lib/supabase', () => ({
  createServerClient: () => mockCreateServerClient(),
}));

jest.mock('@/lib/api/parse-body', () => ({
  parseBody: (...args: unknown[]) => mockParseBody(...args),
}));

async function importRoute() {
  const mod = await import('@/app/api/withdrawals/approve/route');
  return mod.POST;
}

function buildRequest(body: unknown): Request {
  return new Request('http://localhost/api/withdrawals/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/withdrawals/approve', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('401 when no auth', async () => {
    mockVerifyStaffSession.mockResolvedValue(null);
    const POST = await importRoute();
    const res = await POST(buildRequest({ id: 'some-id' }));
    expect(res.status).toBe(401);
  });

  it('403 when staff without canApproveSettlement', async () => {
    mockVerifyStaffSession.mockResolvedValue({
      userId: 'staff-1',
      role: 'staff',
      isAdmin: false,
      canApproveSettlement: false,
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({ id: 'withdrawal-id' }));
    expect(res.status).toBe(403);
  });

  it('400 when id missing', async () => {
    mockVerifyStaffSession.mockResolvedValue({
      userId: 'staff-1',
      role: 'staff',
      isAdmin: false,
      canApproveSettlement: true,
    });
    mockParseBody.mockResolvedValueOnce({
      ok: false as const,
      response: NextResponse.json({ error: 'id 필요' }, { status: 400 }),
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBeDefined();
  });

  it('400 when id is empty string', async () => {
    mockVerifyStaffSession.mockResolvedValue({
      userId: 'staff-1',
      role: 'staff',
      isAdmin: false,
      canApproveSettlement: true,
    });
    mockParseBody.mockResolvedValueOnce({
      ok: false as const,
      response: NextResponse.json({ error: '유효한 출금 요청 ID가 필요합니다.' }, { status: 400 }),
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({ id: '' }));
    expect(res.status).toBe(400);
  });

  it('500 when createServerClient returns null', async () => {
    mockVerifyStaffSession.mockResolvedValue({
      userId: 'staff-1',
      role: 'staff',
      isAdmin: false,
      canApproveSettlement: true,
    });
    mockParseBody.mockResolvedValue({ ok: true as const, data: { id: '11111111-1111-1111-1111-111111111111' } });
    mockCreateServerClient.mockReturnValue(null);
    const POST = await importRoute();
    const res = await POST(buildRequest({ id: '11111111-1111-1111-1111-111111111111' }));
    expect(res.status).toBe(500);
  });

  it('200 when session has permission and supabase update succeeds', async () => {
    mockVerifyStaffSession.mockResolvedValue({
      userId: 'staff-1',
      role: 'staff',
      isAdmin: false,
      canApproveSettlement: true,
    });
    mockParseBody.mockResolvedValue({ ok: true as const, data: { id: '11111111-1111-1111-1111-111111111111' } });
    mockCreateServerClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'audit_logs') {
          return { insert: () => Promise.resolve({ error: null }) };
        }
        return {
          update: () => ({ eq: () => Promise.resolve({ error: null }) }),
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: { amount: 0, realtor_id: null },
                  error: null,
                }),
            }),
          }),
        };
      },
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({ id: '11111111-1111-1111-1111-111111111111' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
  });
});
