/**
 * 수수료 타입
 */

export interface Commission {
  id: string;
  partnerId: string;
  partnerName: string;
  customerId: string;
  customerName: string;
  propertyId?: string;
  propertyTitle?: string;
  type: CommissionType;
  amount: number;
  rate: number;
  status: CommissionStatus;
  settlementId?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

export type CommissionType =
  | 'referral'
  | 'contract'
  | 'consultation'
  | 'bonus'
  | 'recurring';

export type CommissionStatus =
  | 'pending'
  | 'confirmed'
  | 'settled'
  | 'disputed'
  | 'cancelled';
