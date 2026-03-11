/**
 * 파트너(중개사) 타입
 */

export interface Partner {
  id: string;
  userId: string;
  companyName: string;
  representativeName: string;
  businessNumber: string;
  licenseNumber: string;
  address: string;
  phone: string;
  email: string;
  tier: PartnerTier;
  status: PartnerStatus;
  totalSettlement: number;
  pendingSettlement: number;
  customerCount: number;
  joinedAt: string;
  verifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  bankInfo?: {
    bankName: string;
    accountNumber: string;
    accountHolder: string;
  };
}

export type PartnerTier =
  | 'bronze'
  | 'silver'
  | 'gold'
  | 'platinum'
  | 'diamond';

export type PartnerStatus =
  | 'pending_verification'
  | 'active'
  | 'suspended'
  | 'terminated';
