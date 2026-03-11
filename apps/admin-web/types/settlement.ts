/**
 * 정산 타입
 */

export interface Settlement {
  id: string;
  partnerId: string;
  partnerName: string;
  amount: number;
  fee: number;
  netAmount: number;
  status: SettlementStatus;
  period: {
    startDate: string;
    endDate: string;
  };
  commissionIds: string[];
  bankInfo: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
  processedAt?: string;
  failedReason?: string;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}

export type SettlementStatus =
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';
