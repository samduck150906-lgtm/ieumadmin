/**
 * 결제 타입
 */

export interface Payment {
  id: string;
  userId: string;
  userName: string;
  type: PaymentType;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  propertyId?: string;
  receiptUrl?: string;
  pgTransactionId?: string;
  failedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type PaymentType =
  | 'property_unlock'
  | 'subscription'
  | 'premium_feature';

export type PaymentMethod =
  | 'card'
  | 'bank_transfer'
  | 'kakao_pay'
  | 'naver_pay'
  | 'toss_pay';

export type PaymentStatus =
  | 'pending'
  | 'completed'
  | 'failed'
  | 'refunded'
  | 'cancelled';
