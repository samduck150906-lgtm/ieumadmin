/**
 * DB 열람 결제(결제확정) + 배정 API 통합 테스트 — 운영급 핵심 mutation
 * POST /api/partner/db-view-pay
 */
import { NextResponse } from 'next/server';

const mockVerifyPartnerSession = jest.fn();
const mockCreateServerClient = jest.fn();
const mockGetDbViewPrice = jest.fn();
const mockGetDbCompletionPrice = jest.fn();
const mockRecordDbViewPayment = jest.fn();
const mockIsZeroWonPurchaseInCooldown = jest.fn();

jest.mock('@/lib/auth-middleware', () => ({
  verifyPartnerSession: (req: Request) => mockVerifyPartnerSession(req),
  unauthorizedResponse: (msg?: string) =>
    NextResponse.json({ error: msg || 'Unauthorized' }, { status: 401 }),
}));

jest.mock('@/lib/supabase', () => ({
  createServerClient: () => mockCreateServerClient(),
}));

jest.mock('@/lib/api/partner-db', () => ({
  getDbViewPrice: (...args: unknown[]) => mockGetDbViewPrice(...args),
  getDbCompletionPrice: (...args: unknown[]) => mockGetDbCompletionPrice(...args),
  recordDbViewPayment: (...args: unknown[]) => mockRecordDbViewPayment(...args),
  isZeroWonPurchaseInCooldown: (...args: unknown[]) => mockIsZeroWonPurchaseInCooldown(...args),
}));

async function importRoute() {
  const mod = await import('@/app/api/partner/db-view-pay/route');
  return mod.POST;
}

function buildRequest(body: unknown, authHeader?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = authHeader;
  return new Request('http://localhost/api/partner/db-view-pay', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  }) as unknown as import('next/server').NextRequest;
}

describe('POST /api/partner/db-view-pay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('400 when service_request_id missing', async () => {
    mockVerifyPartnerSession.mockResolvedValue({ partnerId: 'p1' });
    const POST = await importRoute();
    const res = await POST(buildRequest({}, 'Bearer any-token'));
    expect(res.status).toBe(400);
    const data = await res.json().catch(() => ({}));
    expect(data.error || data).toMatch(/service_request_id|필요/);
  });

  it('401 when no session / partner', async () => {
    mockVerifyPartnerSession.mockResolvedValue(null);
    const POST = await importRoute();
    const res = await POST(buildRequest({ service_request_id: 'sr-1' }));
    expect(res.status).toBe(401);
    const data = await res.json().catch(() => ({}));
    expect(data.error || '').toMatch(/로그인|파트너/);
  });

  it('500 when createServerClient returns null', async () => {
    mockVerifyPartnerSession.mockResolvedValue({ partnerId: 'p1' });
    mockCreateServerClient.mockReturnValue(null);
    const POST = await importRoute();
    const res = await POST(buildRequest({ service_request_id: 'sr-1' }, 'Bearer t'));
    expect(res.status).toBe(500);
    const data = await res.json().catch(() => ({}));
    expect(data.error).toMatch(/서버 설정|오류/);
  });

  it('404 when service_request not found', async () => {
    mockVerifyPartnerSession.mockResolvedValue({ partnerId: 'p1' });
    mockCreateServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
          }),
        }),
      }),
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({ service_request_id: 'sr-none' }, 'Bearer t'));
    expect(res.status).toBe(404);
    const data = await res.json().catch(() => ({}));
    expect(data.error).toMatch(/찾을 수 없습니다|DB/);
  });

  it('200 unlocked when already assigned to same partner', async () => {
    mockVerifyPartnerSession.mockResolvedValue({ partnerId: 'p1' });
    mockCreateServerClient.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () =>
              Promise.resolve({
                data: {
                  id: 'sr-1',
                  category: 'moving',
                  assigned_partner_id: 'p1',
                  customer: { area_size: 10, moving_type: 'family' },
                },
                error: null,
              }),
          }),
        }),
      }),
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({ service_request_id: 'sr-1' }, 'Bearer t'));
    expect(res.status).toBe(200);
    const data = await res.json().catch(() => ({}));
    expect(data.unlocked).toBe(true);
    expect(data.message).toMatch(/이미 배정|열람/);
  });

  it('429 when 0원 and in cooldown', async () => {
    mockVerifyPartnerSession.mockResolvedValue({ partnerId: 'p1' });
    const serviceRequestChain = {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: 'sr-1',
                category: 'moving',
                assigned_partner_id: null,
                customer: { area_size: 10, moving_type: 'family' },
              },
              error: null,
            }),
        }),
      }),
    };
    const policyChain = {
      select: () => ({
        in: () => ({ order: () => Promise.resolve({ data: [] }) }),
      }),
    };
    mockCreateServerClient.mockReturnValue({
      from: (table: string) =>
        table === 'db_market_purchase_policy'
          ? policyChain
          : { ...serviceRequestChain },
    });
    mockGetDbViewPrice.mockResolvedValue(0);
    mockIsZeroWonPurchaseInCooldown.mockResolvedValue(true);
    const POST = await importRoute();
    const res = await POST(buildRequest({ service_request_id: 'sr-1' }, 'Bearer t'));
    expect(res.status).toBe(429);
    const data = await res.json().catch(() => ({}));
    expect(data.error).toMatch(/10분|0원/);
  });

  it('400 when price not set (amount < 0)', async () => {
    mockVerifyPartnerSession.mockResolvedValue({ partnerId: 'p1' });
    const serviceRequestChain = {
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: {
                id: 'sr-1',
                category: 'moving',
                assigned_partner_id: null,
                customer: {},
              },
              error: null,
            }),
        }),
      }),
    };
    const policyChain = {
      select: () => ({
        in: () => ({ order: () => Promise.resolve({ data: [] }) }),
      }),
    };
    mockCreateServerClient.mockReturnValue({
      from: (table: string) =>
        table === 'db_market_purchase_policy'
          ? policyChain
          : { ...serviceRequestChain },
    });
    mockGetDbViewPrice.mockResolvedValue(-1);
    const POST = await importRoute();
    const res = await POST(buildRequest({ service_request_id: 'sr-1' }, 'Bearer t'));
    expect(res.status).toBe(400);
    const data = await res.json().catch(() => ({}));
    expect(data.error).toMatch(/열람가|설정/);
  });

  it('409 when already assigned to another partner', async () => {
    mockVerifyPartnerSession.mockResolvedValue({ partnerId: 'p1' });
    mockGetDbViewPrice.mockResolvedValue(5000);
    const selectChain = {
      eq: () => ({
        single: () =>
          Promise.resolve({
            data: {
              id: 'sr-1',
              category: 'moving',
              assigned_partner_id: 'other-partner',
              customer: {},
            },
            error: null,
          }),
      }),
    };
    const policyChain = {
      in: () => ({ order: () => Promise.resolve({ data: [] }) }),
    };
    const countZeroChain = {
      eq: () => ({
        eq: () => Promise.resolve({ count: 0 }),
        gte: () => Promise.resolve({ count: 0 }),
      }),
    };
    const updateChain = {
      eq: () => ({
        is: () => ({
          select: () => ({
            maybeSingle: () => Promise.resolve({ data: null }),
          }),
        }),
      }),
    };
    mockCreateServerClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'db_market_purchase_policy') {
          return { select: () => policyChain, update: () => ({ eq: () => ({}) }) };
        }
        if (table === 'db_view_payments') {
          return { select: () => countZeroChain };
        }
        return {
          select: () => selectChain,
          update: () => updateChain,
        };
      },
    });
    const POST = await importRoute();
    const res = await POST(buildRequest({ service_request_id: 'sr-1' }, 'Bearer t'));
    expect(res.status).toBe(409);
    const data = await res.json().catch(() => ({}));
    expect(data.error).toMatch(/이미 다른 업체|배정/);
  });
});
