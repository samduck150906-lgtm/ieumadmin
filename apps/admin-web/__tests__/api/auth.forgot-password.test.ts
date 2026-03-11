/**
 * POST /api/auth/forgot-password — 비밀번호 찾기 API
 */
import { NextRequest } from 'next/server';

const mockCreateServerClient = jest.fn();
const mockCheckRateLimit = jest.fn();
const mockGetClientIdentifier = jest.fn();
const mockSendSMS = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  createServerClient: () => mockCreateServerClient(),
}));

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: (key: string, opts: unknown) => mockCheckRateLimit(key, opts),
  getClientIdentifier: (req: Request) => mockGetClientIdentifier(req),
}));

jest.mock('@/lib/notifications', () => ({
  sendSMS: (payload: unknown) => mockSendSMS(payload),
}));

async function importRoute() {
  const mod = await import('@/app/api/auth/forgot-password/route');
  return mod.POST;
}

function buildRequest(body: { name?: string; phone?: string }): NextRequest {
  return new NextRequest('http://localhost/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/auth/forgot-password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetClientIdentifier.mockReturnValue('ip:test');
    mockCheckRateLimit.mockReturnValue({ allowed: true });
  });

  it('400 when name too short', async () => {
    mockCreateServerClient.mockReturnValue({});
    const POST = await importRoute();
    const res = await POST(buildRequest({ name: 'A', phone: '01012345678' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/이름/);
    expect(data.field).toBe('name');
  });

  it('400 when phone invalid', async () => {
    mockCreateServerClient.mockReturnValue({});
    const POST = await importRoute();
    const res = await POST(buildRequest({ name: '홍길동', phone: '123' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.field).toBe('phone');
  });

  it('429 when rate limit exceeded', async () => {
    mockCheckRateLimit.mockReturnValue({ allowed: false, retryAfterMs: 60000 });
    const POST = await importRoute();
    const res = await POST(buildRequest({ name: '홍길동', phone: '01012345678' }));
    expect(res.status).toBe(429);
  });

  it('500 when createServerClient returns null', async () => {
    mockCreateServerClient.mockReturnValue(null);
    const POST = await importRoute();
    const res = await POST(buildRequest({ name: '홍길동', phone: '01012345678' }));
    expect(res.status).toBe(500);
  });

  it('200 not_found when user not found', async () => {
    mockCreateServerClient.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: null, error: null }),
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({ name: '홍길동', phone: '01012345678' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(false);
    expect(data.code).toBe('not_found');
  });

  it('200 success and sends SMS when user found', async () => {
    const mockRpc = jest.fn().mockResolvedValue({ data: 'user-uuid-1', error: null });
    const mockUpdateUser = jest.fn().mockResolvedValue({ error: null });
    mockCreateServerClient.mockReturnValue({
      rpc: mockRpc,
      auth: { admin: { updateUserById: mockUpdateUser } },
    });
    mockSendSMS.mockResolvedValue({ success: true });
    const POST = await importRoute();
    const res = await POST(buildRequest({ name: '홍길동', phone: '01012345678' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(mockRpc).toHaveBeenCalledWith('find_user_id_by_name_and_phone', {
      p_name: '홍길동',
      p_phone: '01012345678',
    });
    expect(mockUpdateUser).toHaveBeenCalledWith('user-uuid-1', expect.any(Object));
    expect(mockSendSMS).toHaveBeenCalled();
  });
});
