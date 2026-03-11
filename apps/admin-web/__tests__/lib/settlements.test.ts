import { getSupabase } from '@/lib/supabase';
import { canRequestWithdrawal, createWithdrawalRequest } from '@/lib/api/settlements';

jest.mock('@/lib/supabase', () => ({
  getSupabase: jest.fn(),
}));

const getSupabaseMock = getSupabase as jest.Mock;

type SelectResult = { data?: any; error?: any };

function createRealtorBuilder(result: SelectResult = {}) {
  const single = jest.fn().mockResolvedValue(result);
  return {
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        single,
      })),
    })),
    single,
  };
}

function createWithdrawalBuilder(insertResult: { error?: any } = {}) {
  return {
    insert: jest.fn().mockResolvedValue(insertResult),
  };
}

const createSupabaseMock = (realtorResult: SelectResult, withdrawalError: any) => {
  const realtor = createRealtorBuilder(realtorResult);
  const withdrawal = createWithdrawalBuilder(withdrawalError != null ? { error: withdrawalError } : {});
  return {
    from: jest.fn((table: string) => {
      if (table === 'realtors') return realtor;
      if (table === 'withdrawal_requests') return withdrawal;
      throw new Error(`Unexpected table: ${table}`);
    }),
    __realtorBuilder: realtor,
    __withdrawalBuilder: withdrawal,
  };
};

describe('canRequestWithdrawal', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('20일 이전에는 신청이 불가하다', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-19T12:00:00+09:00'));

    const result = canRequestWithdrawal();

    expect(result.allowed).toBe(false);
    expect(result.message).toContain('20일부터');
  });

  it('20일 이후에는 신청이 가능하다', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-20T12:00:00+09:00'));

    const result = canRequestWithdrawal();

    expect(result.allowed).toBe(true);
    expect(result.message).toBeUndefined();
  });
});

describe('createWithdrawalRequest', () => {
  const payload = {
    amount: 100000,
    bank_name: '신한은행',
    account_number: '123-456-789',
    account_holder: '홍길동',
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-20T12:00:00+09:00'));
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('계좌 인증이 되어있지 않으면 실패한다', async () => {
    const supabase = createSupabaseMock(
      { data: { id: 'r1', account_verified: false, account_type: 'personal' } },
      null
    );
    getSupabaseMock.mockReturnValue(supabase);

    await expect(createWithdrawalRequest('r1', payload)).rejects.toThrow('계좌 인증');
    expect(supabase.__withdrawalBuilder.insert).not.toHaveBeenCalled();
  });

  it('정상 신청 시 withdrawal_requests에 저장한다', async () => {
    const supabase = createSupabaseMock(
      { data: { id: 'r2', account_verified: true, account_type: 'personal' } },
      null
    );
    getSupabaseMock.mockReturnValue(supabase);

    await expect(createWithdrawalRequest('r2', payload)).resolves.toBeUndefined();
    expect(supabase.__withdrawalBuilder.insert).toHaveBeenCalledWith({
      realtor_id: 'r2',
      amount: payload.amount,
      bank_name: payload.bank_name,
      account_number: payload.account_number,
      account_holder: payload.account_holder,
      status: 'requested',
    });
  });

  it('정산 신청 실패 시 에러를 전파한다', async () => {
    const supabase = createSupabaseMock(
      { data: { id: 'r3', account_verified: true, account_type: 'personal' } },
      { message: 'insert failed' }
    );
    getSupabaseMock.mockReturnValue(supabase);
    // insert가 { error }를 반환하면 코드가 throw error 하므로 reject 됨
    await expect(createWithdrawalRequest('r3', payload)).rejects.toMatchObject({
      message: 'insert failed',
    });
  });
});
