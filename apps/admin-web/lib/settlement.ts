/**
 * 이음 정산 규칙:
 *
 * [수수료 구조] — pricing_config 테이블 기반, 하드코딩 아님
 * 1. DB 열람가격: 제휴업체가 모자이크 DB 열람 시 지불
 * 2. 예약완료 지불액(completion_price): 서비스 완료 시 지불
 *    → 이 금액이 공인중개사의 전환수수료 원천
 *
 * [전환수수료]
 * - 서비스 완료 시 해당 건의 completion_price가 추천 중개사에게 지급
 * - pricing_config에서 카테고리/평수/이사형태별로 설정
 *
 * [추천수수료]
 * - 피추천인의 수익금(상담요청 수수료 + 전체완료 수수료)의 5%
 * - 가입일로부터 1년간만
 * - 추천수수료는 제외하고 순수 전환/상담 수수료 기준으로 산출
 *
 * [세금]
 * - 개인(공인중개사): 원천징수 3.3% 일괄 공제 (소득세 3% + 주민세 0.3% 합산)
 * - 사업자(제휴업체): 부가세 10% 별도 (세금계산서 발행)
 *
 * [정산 주기]
 * - 매월 20일 기산 (전월 21일 ~ 당월 20일)
 * - 출금 신청 가능 시점: 매월 20일
 */

export const REFERRAL_RATE = 0.05; // 추천수수료 비율 5%

// 개인 원천징수율 (3.3% = 소득세 3% + 주민세 0.3%)
export const INDIVIDUAL_WITHHOLDING_RATE = 0.033;

// 사업자 부가세율
export const BUSINESS_VAT_RATE = 0.1;

export type TaxType = 'individual' | 'business';

export interface SettlementSummary {
  grossAmount: number; // 총 수수료
  taxAmount: number; // 세금
  netAmount: number; // 실수령액
  taxType: TaxType;
  taxDescription: string;
}

/**
 * 세금 계산
 * - 개인: 3.3% 원천징수 (일괄, 이중 공제 아님)
 * - 사업자: 부가세 10% 별도 → 세금계산서 발행
 */
export function calculateSettlement(
  totalCommission: number,
  taxType: TaxType
): SettlementSummary {
  if (taxType === 'individual') {
    // 개인: 원천징수 3.3% 공제
    const taxAmount = Math.round(totalCommission * INDIVIDUAL_WITHHOLDING_RATE);
    return {
      grossAmount: totalCommission,
      taxAmount,
      netAmount: totalCommission - taxAmount,
      taxType,
      taxDescription: `원천징수 3.3% (소득세 3% + 주민세 0.3%)`,
    };
  } else {
    // 사업자: 부가세 10% 별도 (세금계산서 발행)
    // 사업자는 공제가 아니라 부가세를 별도 청구
    const vatAmount = Math.round(totalCommission * BUSINESS_VAT_RATE);
    return {
      grossAmount: totalCommission,
      taxAmount: vatAmount,
      netAmount: totalCommission, // 사업자는 VAT 별도이므로 실수령 = 총액
      taxType,
      taxDescription: `부가세 10% 별도 (세금계산서 발행, VAT ${vatAmount.toLocaleString()}원)`,
    };
  }
}

/**
 * 정산 기간 계산
 * 매월 20일 기산: 전월 21일 ~ 당월 20일
 */
export function getSettlementPeriod(year: number, month: number) {
  // 전월 21일
  const startDate = new Date(year, month - 2, 21);
  // 당월 20일 23:59:59
  const endDate = new Date(year, month - 1, 20, 23, 59, 59);
  // 출금 가능일: 당월 20일
  const withdrawalDate = new Date(year, month - 1, 20);

  return { startDate, endDate, withdrawalDate };
}

/**
 * 추천수수료 계산
 * 피추천인 수익금(상담요청 + 전체완료 수수료)의 5% (추천수수료는 제외하고 순수 전환/상담 수수료 기준)
 */
export function calculateReferralCommission(conversionAmount: number): number {
  return Math.round(conversionAmount * REFERRAL_RATE);
}
