import { createHmac, timingSafeEqual } from 'node:crypto';

export type DbViewPaymentProvider = 'mock' | 'toss';

export interface DbViewSessionPayload {
  version: 1;
  kind: 'db-view';
  partner_id: string;
  service_request_id: string;
  view_price: number;
  completion_price: number;
  issued_at: number;
  expires_at: number;
}

type DbViewSessionPayloadInput = Omit<DbViewSessionPayload, 'version' | 'issued_at' | 'expires_at'> & {
  ttlMinutes?: number;
};

export interface DbViewCheckoutInput {
  sessionToken: string;
  serviceRequestId: string;
  amount: number;
  callbackUrl: string;
  orderName: string;
}

export interface DbViewCheckoutOutput {
  provider: DbViewPaymentProvider;
  paymentUrl: string;
}

const DEFAULT_TTL_MINUTES = 10;
const DEFAULT_PROVIDER: DbViewPaymentProvider = 'mock';
const DEV_FALLBACK_SECRET = 'dev-change-me-immediately';

function getSessionSecret(): string {
  const secret = process.env.PAYMENT_SESSION_SECRET;
  const isProduction =
    process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProduction && (!secret || secret.trim() === '' || secret === DEV_FALLBACK_SECRET)) {
    throw new Error(
      '프로덕션에서는 PAYMENT_SESSION_SECRET이 반드시 설정되어야 하며, 기본값(dev-change-me-immediately)을 사용할 수 없습니다.'
    );
  }
  return secret?.trim() || DEV_FALLBACK_SECRET;
}

function getProvider(): DbViewPaymentProvider {
  const provider = (process.env.PAYMENT_PROVIDER || DEFAULT_PROVIDER).trim().toLowerCase();
  if (provider === 'toss') return 'toss';
  return 'mock';
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function safeSignatureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function signSession(raw: string): string {
  return createHmac('sha256', getSessionSecret()).update(raw).digest('hex');
}

export function createDbViewPaymentSessionToken(input: DbViewSessionPayloadInput): string {
  const ttlMinutes = Math.max(1, input.ttlMinutes ?? DEFAULT_TTL_MINUTES);
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: DbViewSessionPayload = {
    version: 1,
    kind: 'db-view',
    partner_id: input.partner_id,
    service_request_id: input.service_request_id,
    view_price: Number(input.view_price) || 0,
    completion_price: Number(input.completion_price) || 0,
    issued_at: issuedAt,
    expires_at: issuedAt + ttlMinutes * 60,
  };
  const raw = base64url(JSON.stringify(payload));
  const signature = signSession(raw);
  return `${raw}.${signature}`;
}

export function parseDbViewPaymentSessionToken(token: string): DbViewSessionPayload {
  const [raw, signature] = token.split('.');
  if (!raw || !signature) {
    throw new Error('세션 토큰 형식이 올바르지 않습니다.');
  }
  const expected = signSession(raw);
  if (!safeSignatureCompare(signature, expected)) {
    throw new Error('세션 토큰 서명이 유효하지 않습니다.');
  }

  const json = Buffer.from(raw, 'base64url').toString('utf8');
  const payload = JSON.parse(json) as DbViewSessionPayload;
  if (payload.kind !== 'db-view' || payload.version !== 1) {
    throw new Error('세션 타입이 일치하지 않습니다.');
  }
  if (payload.expires_at <= Math.floor(Date.now() / 1000)) {
    throw new Error('세션이 만료되었습니다.');
  }
  return payload;
}

export function buildDbViewCheckoutUrl(baseUrl: string, input: DbViewCheckoutInput): DbViewCheckoutOutput {
  const provider = getProvider();
  const params: Record<string, string> = {
    session: input.sessionToken,
    serviceRequestId: input.serviceRequestId,
    flowId: input.serviceRequestId,
    kind: 'db-view',
    amount: String(Math.max(0, Math.floor(input.amount))),
    callback: input.callbackUrl,
    orderName: input.orderName,
  };
  const encoded = new URLSearchParams(params).toString();

  const path = provider === 'mock' ? '/api/payments/mock-checkout' : '/payments/toss-checkout';
  return {
    provider,
    paymentUrl: `${baseUrl.replace(/\/$/, '')}${path}?${encoded}`,
  };
}

export function isMockPaymentProvider(): boolean {
  return getProvider() === 'mock';
}
