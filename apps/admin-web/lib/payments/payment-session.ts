import { createHmac, timingSafeEqual } from 'node:crypto';

export type PaymentProvider = 'mock' | 'toss';

export type PaymentSessionKind = 'db-view' | 'property' | 'withdrawal';

export interface BasePaymentSessionPayload {
  version: 1;
  kind: PaymentSessionKind;
  issued_at: number;
  expires_at: number;
}

export interface DbViewSessionPayload extends BasePaymentSessionPayload {
  kind: 'db-view';
  partner_id: string;
  service_request_id: string;
  view_price: number;
  completion_price: number;
  /** 마일리지로 차감한 금액 (finalize 시 use_partner_mileage 호출) */
  mileage_used?: number;
}

export interface PropertySessionPayload extends BasePaymentSessionPayload {
  kind: 'property';
  user_id: string;
  property_id: string;
  amount: number;
}

export interface WithdrawalSessionPayload extends BasePaymentSessionPayload {
  kind: 'withdrawal';
  user_id: string;
  realtor_id: string;
  withdrawal_id: string;
  amount: number;
}

export type AnyPaymentSessionPayload =
  | DbViewSessionPayload
  | PropertySessionPayload
  | WithdrawalSessionPayload;

export interface DbViewCheckoutInput {
  sessionToken: string;
  serviceRequestId: string;
  callbackUrl: string;
  amount: number;
  orderName: string;
}

export interface PropertyCheckoutInput {
  sessionToken: string;
  callbackUrl: string;
  amount: number;
  propertyId: string;
  orderName: string;
}

export interface WithdrawalCheckoutInput {
  sessionToken: string;
  callbackUrl: string;
  amount: number;
  withdrawalId: string;
  orderName: string;
}

export interface CheckoutOutput {
  provider: PaymentProvider;
  paymentUrl: string;
}

type DbViewSessionInput = Omit<DbViewSessionPayload, 'version' | 'issued_at' | 'expires_at'> & {
  ttlMinutes?: number;
};

type PropertySessionInput = Omit<PropertySessionPayload, 'version' | 'issued_at' | 'expires_at'> & {
  ttlMinutes?: number;
};

type WithdrawalSessionInput = Omit<WithdrawalSessionPayload, 'version' | 'issued_at' | 'expires_at'> & {
  ttlMinutes?: number;
};

const DEFAULT_TTL_MINUTES = 10;
const DEFAULT_PROVIDER: PaymentProvider = 'mock';
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

function getProvider(): PaymentProvider {
  const raw = process.env.PAYMENT_PROVIDER || DEFAULT_PROVIDER;
  const value = raw.trim().toLowerCase();
  return value === 'toss' ? 'toss' : DEFAULT_PROVIDER;
}

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'hex');
  const bBuf = Buffer.from(b, 'hex');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function sign(raw: string): string {
  return createHmac('sha256', getSessionSecret()).update(raw).digest('hex');
}

function createToken<T extends Omit<BasePaymentSessionPayload, 'version' | 'issued_at' | 'expires_at'>>(
  input: T,
  ttlMinutes = DEFAULT_TTL_MINUTES
): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    version: 1,
    ...input,
    issued_at: issuedAt,
    expires_at: issuedAt + Math.max(1, ttlMinutes) * 60,
  };
  const raw = base64url(JSON.stringify(payload));
  return `${raw}.${sign(raw)}`;
}

function parseToken(token: string): AnyPaymentSessionPayload {
  const [raw, signature] = token.split('.');
  if (!raw || !signature) {
    throw new Error('세션 토큰 형식이 올바르지 않습니다.');
  }

  const expected = sign(raw);
  if (!safeEqual(signature, expected)) {
    throw new Error('세션 토큰 서명이 유효하지 않습니다.');
  }

  const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as AnyPaymentSessionPayload;
  if (payload.version !== 1) {
    throw new Error('세션 버전이 일치하지 않습니다.');
  }
  if (payload.expires_at <= Math.floor(Date.now() / 1000)) {
    throw new Error('세션이 만료되었습니다.');
  }
  if (!['db-view', 'property', 'withdrawal'].includes(payload.kind)) {
    throw new Error('지원하지 않는 결제 세션 타입입니다.');
  }
  return payload;
}

export function createDbViewPaymentSessionToken(input: DbViewSessionInput): string {
  const payload: Record<string, unknown> = {
    kind: 'db-view',
    partner_id: input.partner_id,
    service_request_id: input.service_request_id,
    view_price: Number(input.view_price) || 0,
    completion_price: Number(input.completion_price) || 0,
  };
  if (Number(input.mileage_used) > 0) {
    payload.mileage_used = Math.floor(Number(input.mileage_used));
  }
  return createToken(payload as Pick<DbViewSessionPayload, 'kind' | 'partner_id' | 'service_request_id' | 'view_price' | 'completion_price'> & { mileage_used?: number }, input.ttlMinutes);
}

export function createPropertyPaymentSessionToken(input: PropertySessionInput): string {
  return createToken<Pick<PropertySessionPayload, 'kind' | 'user_id' | 'property_id' | 'amount'>>(
    {
      kind: 'property',
      user_id: input.user_id,
      property_id: input.property_id,
      amount: Number(input.amount) || 0,
    },
    input.ttlMinutes
  );
}

export function createWithdrawalPaymentSessionToken(input: WithdrawalSessionInput): string {
  return createToken<Pick<WithdrawalSessionPayload, 'kind' | 'user_id' | 'realtor_id' | 'withdrawal_id' | 'amount'>>(
    {
      kind: 'withdrawal',
      user_id: input.user_id,
      realtor_id: input.realtor_id,
      withdrawal_id: input.withdrawal_id,
      amount: Number(input.amount) || 0,
    },
    input.ttlMinutes
  );
}

export function parseDbViewPaymentSessionToken(token: string): DbViewSessionPayload {
  const payload = parseToken(token);
  if (payload.kind !== 'db-view') {
    throw new Error('세션 타입이 일치하지 않습니다.');
  }
  return payload;
}

export function parsePropertyPaymentSessionToken(token: string): PropertySessionPayload {
  const payload = parseToken(token);
  if (payload.kind !== 'property') {
    throw new Error('세션 타입이 일치하지 않습니다.');
  }
  return payload;
}

export function parseWithdrawalPaymentSessionToken(token: string): WithdrawalSessionPayload {
  const payload = parseToken(token);
  if (payload.kind !== 'withdrawal') {
    throw new Error('세션 타입이 일치하지 않습니다.');
  }
  return payload;
}

export function buildDbViewCheckoutUrl(baseUrl: string, input: DbViewCheckoutInput): CheckoutOutput {
  const provider = getProvider();
  const path = provider === 'mock' ? '/api/payments/mock-checkout' : '/payments/toss-checkout';
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
  const params = {
    session: input.sessionToken,
    callback: input.callbackUrl,
    kind: 'db-view',
    flowId: input.serviceRequestId,
    amount: String(Math.max(0, Math.floor(input.amount))),
    orderName: input.orderName,
  };

  Object.entries(params).forEach(([k, v]) => {
    if (v) url.searchParams.set(k, v);
  });

  return {
    provider,
    paymentUrl: url.toString(),
  };
}

export function buildPropertyCheckoutUrl(baseUrl: string, input: PropertyCheckoutInput): CheckoutOutput {
  const provider = getProvider();
  const path = provider === 'mock' ? '/api/payments/mock-checkout' : '/payments/toss-checkout';
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
  url.searchParams.set('session', input.sessionToken);
  url.searchParams.set('callback', input.callbackUrl);
  url.searchParams.set('kind', 'property');
  url.searchParams.set('flowId', input.propertyId);
  url.searchParams.set('amount', String(Math.max(0, Math.floor(input.amount))));
  url.searchParams.set('orderName', input.orderName);

  return {
    provider,
    paymentUrl: url.toString(),
  };
}

export function buildWithdrawalCheckoutUrl(baseUrl: string, input: WithdrawalCheckoutInput): CheckoutOutput {
  const provider = getProvider();
  const path = provider === 'mock' ? '/api/payments/mock-checkout' : '/payments/toss-checkout';
  const url = new URL(`${baseUrl.replace(/\/$/, '')}${path}`);
  url.searchParams.set('session', input.sessionToken);
  url.searchParams.set('callback', input.callbackUrl);
  url.searchParams.set('kind', 'withdrawal');
  url.searchParams.set('flowId', input.withdrawalId);
  url.searchParams.set('amount', String(Math.max(0, Math.floor(input.amount))));
  url.searchParams.set('orderName', input.orderName);

  return {
    provider,
    paymentUrl: url.toString(),
  };
}

export function parseAnyPaymentSessionToken(token: string): AnyPaymentSessionPayload {
  return parseToken(token);
}

export function isMockPaymentProvider(): boolean {
  return getProvider() === 'mock';
}
