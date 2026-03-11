/**
 * 이음 플랫폼 공통 DB 타입·enum·라벨
 * landing / admin-web / mobile-app 단일 소스
 */

// 회원 유형 (DB 컬럼: realtor | partner | staff. admin은 staff.is_admin으로 구분)
export type UserRoleDb = 'realtor' | 'partner' | 'staff';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'terminated';

export const USER_STATUS_LABELS: Record<UserStatus, string> = {
  active: '활성',
  inactive: '비활성',
  suspended: '정지',
  terminated: '해지',
};

// 서비스 카테고리 (DB service_category enum과 동기화, constants.SERVICE_OPTIONS 참고)
export type ServiceCategory =
  | 'moving'
  | 'cleaning'
  | 'internet_tv'
  | 'appliance_rental'
  | 'water_purifier_rental'
  | 'kiosk'
  | 'interior'
  | 'realtor';

// 본사 상태
export type HqStatus =
  | 'unread'
  | 'read'
  | 'assigned'
  | 'settlement_check'
  | 'settlement_done'
  | 'cancelled'
  | 'hq_review_needed';

// 요구사항: 본사 배정상태 미배정/열람/배정완료/정산확인/정산완료/취소
export const HQ_STATUS_LABELS: Record<HqStatus, string> = {
  unread: '미배정',
  read: '열람',
  assigned: '배정완료',
  settlement_check: '정산확인',
  settlement_done: '정산완료',
  cancelled: '취소',
  hq_review_needed: '본사확인필요',
};

// 제휴업체 상태
export type PartnerStatus =
  | 'unread'
  | 'read'
  | 'consulting'
  | 'cancelled'
  | 'reserved'
  | 'completed'
  | 'pending';

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  unread: '미열람',
  read: '열람',
  consulting: '상담예정',
  cancelled: '취소',
  reserved: '예약완료',
  completed: '전체완료',
  pending: '보류',
};

// 이사형태
export type MovingType = 'general' | 'full_pack' | 'half_pack' | 'cargo';
export const MOVING_TYPE_LABELS: Record<MovingType, string> = {
  general: '일반이사',
  full_pack: '포장',
  half_pack: '반포장',
  cargo: '용달(화물)',
};

export const MOVING_TYPE_LABELS_ALT: Record<string, string> = {
  regular: '일반이사',
  package: '포장',
  semi: '반포장',
  general: '일반이사',
  full_pack: '포장',
  half_pack: '반포장',
  cargo: '용달(화물)',
};

// 제휴업체 취소 사유
export type PartnerCancelReason = 'customer_cancel' | 'other_partner' | 'partner_issue';
export const PARTNER_CANCEL_REASON_LABELS: Record<PartnerCancelReason, string> = {
  customer_cancel: '고객 일방취소',
  other_partner: '타업체에 하기로함',
  partner_issue: '본 업체 사정으로 취소',
};

// 평수
export type AreaSize =
  | 'under_10'
  | 'under_20'
  | 'under_30'
  | 'over_30'
  | 'under_12'
  | 'between_12_20'
  | 'over_20';

export const AREA_SIZE_LABELS: Record<string, string> = {
  under_10: '~10평',
  under_20: '~20평',
  under_30: '~30평',
  over_30: '30평 이상',
  under_12: '12평 이하',
  between_12_20: '12~20평',
  over_20: '20평 이상',
};

export const AREA_SIZE_MOVING_TIERS: AreaSize[] = ['under_10', 'under_20', 'under_30', 'over_30'];

// 평점
export type RatingType = 'satisfied' | 'normal' | 'unsatisfied';
export const RATING_LABELS: Record<RatingType, string> = {
  satisfied: '만족',
  normal: '보통',
  unsatisfied: '불만',
};

// 출금/결제 상태
export type WithdrawalStatus = 'requested' | 'approved' | 'completed' | 'rejected';
export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  requested: '신청',
  approved: '승인',
  completed: '완료',
  rejected: '반려',
};

export type PaymentStatus = 'requested' | 'completed';
export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  requested: '요청',
  completed: '완료',
};

// 취소 사유
export type CancelReason = 'other_service' | 'moving_cancelled' | 'pending' | 'other';
export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  other_service: '다른곳에서 신청',
  moving_cancelled: '이사가 취소됨',
  pending: '보류중',
  other: '기타사유',
};

// 인터넷 타입
export type InternetType = 'internet_only' | 'internet_tv';

// ========== 테이블 타입 (필수 필드만, joined 제외) ==========
export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: UserRoleDb;
  status: UserStatus;
  profile_image: string | null;
  created_at: string;
  updated_at: string;
}

export interface Realtor {
  id: string;
  user_id: string;
  business_name: string;
  address: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  qr_code_url: string | null;
  referrer_id: string | null;
  referrer_expires_at: string | null;
  account_type: string | null;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  id_card_url: string | null;
  bankbook_url: string | null;
  business_license_url: string | null;
  account_verified: boolean;
  last_excel_downloaded_at: string | null;
  last_excel_downloaded_by: string | null;
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface Partner {
  id: string;
  user_id: string;
  business_name: string;
  business_number: string | null;
  representative_name: string | null;
  address: string | null;
  contact_phone: string | null;
  manager_name: string | null;
  manager_phone: string | null;
  service_categories: ServiceCategory[];
  avg_rating: number;
  total_reviews: number;
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface Staff {
  id: string;
  user_id: string;
  department: string | null;
  position: string | null;
  is_admin: boolean;
  can_approve_settlement?: boolean;
  created_at: string;
  updated_at: string;
  user?: User;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  moving_date: string | null;
  current_address: string | null;
  moving_address: string | null;
  area_size: AreaSize | null;
  moving_type: MovingType | null;
  source_realtor_id: string | null;
  source_url: string | null;
  current_internet_provider: string | null;
  preferred_internet: string | null;
  created_at: string;
  updated_at: string;
  source_realtor?: Realtor;
  service_requests?: ServiceRequest[];
}

export interface ServiceRequest {
  id: string;
  customer_id: string;
  category: ServiceCategory;
  hq_status: HqStatus;
  hq_memo: string | null;
  hq_read_at: string | null;
  assigned_partner_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  locked_at: string | null;
  locked_by: string | null;
  reassign_count?: number;
  last_reassigned_at?: string | null;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  assigned_partner?: Partner;
  partner_assignment?: PartnerAssignment;
}

export interface PartnerAssignment {
  id: string;
  service_request_id: string;
  partner_id: string;
  status: PartnerStatus;
  read_at: string | null;
  installation_date: string | null;
  auto_complete_at: string | null;
  completed_at: string | null;
  partner_memo: string | null;
  cancel_reason: PartnerCancelReason | null;
  cancel_reason_detail: string | null;
  assigned_by: string | null;
  db_view_price: number | null;
  db_completion_price: number | null;
  created_at: string;
  updated_at: string;
  service_request?: ServiceRequest;
  partner?: Partner;
}

export interface Commission {
  id: string;
  realtor_id: string;
  commission_type: 'conversion' | 'referral';
  service_request_id: string | null;
  referred_realtor_id: string | null;
  amount: number;
  is_settled: boolean;
  settled_at: string | null;
  withdrawal_id: string | null;
  created_at: string;
  realtor?: Realtor;
  referred_realtor?: Realtor;
}

export interface WithdrawalRequest {
  id: string;
  realtor_id: string;
  amount: number;
  bank_name: string | null;
  account_number: string | null;
  account_holder: string | null;
  status: WithdrawalStatus;
  processed_by: string | null;
  processed_at: string | null;
  reject_reason: string | null;
  created_at: string;
  updated_at: string;
  realtor?: Realtor;
}

export interface PartnerPaymentRequest {
  id: string;
  partner_id: string;
  amount: number;
  memo: string | null;
  status: PaymentStatus;
  completed_at: string | null;
  requested_by: string | null;
  created_at: string;
  updated_at: string;
  partner?: Partner;
}

export interface Review {
  id: string;
  service_request_id: string;
  partner_id: string;
  customer_id: string;
  rating: RatingType;
  comment: string | null;
  created_at: string;
}

export interface CancellationFeedback {
  id: string;
  service_request_id: string;
  customer_id: string;
  reason: CancelReason;
  reason_detail: string | null;
  created_at: string;
}

export interface NotificationLog {
  id: string;
  recipient_phone: string;
  recipient_name: string | null;
  recipient_id: string | null;
  notification_type: string;
  channel: 'alimtalk' | 'sms' | 'lms';
  template_code: string | null;
  message_content: string | null;
  service_request_id: string | null;
  is_sent: boolean;
  sent_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface Notice {
  id: string;
  title: string;
  content: string;
  is_published: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Faq {
  id: string;
  category: string | null;
  question: string;
  answer: string;
  sort_order: number;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface PartnerApplication {
  id: string;
  category: string;
  business_name: string;
  business_number: string | null;
  address: string | null;
  manager_name: string;
  manager_phone: string;
  email: string | null;
  introduction: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DbPriceMoving {
  id: string;
  area_size: AreaSize;
  moving_type: MovingType;
  view_price: number;
  complete_price: number;
  created_at: string;
  updated_at: string;
}

export interface DbPriceCleaning {
  id: string;
  price_per_pyeong: number;
  created_at: string;
  updated_at: string;
}

export interface DbPriceInternet {
  id: string;
  internet_type: InternetType;
  view_price: number;
  complete_price: number;
  created_at: string;
  updated_at: string;
}

export interface PricingConfig {
  id: string;
  category: string;
  area_size?: string;
  moving_type?: string;
  internet_type?: string;
  view_price: number;
  completion_price: number;
  per_area_unit_price?: number;
  created_at: string;
  updated_at: string;
}

export interface RecentRequestItem {
  id: string;
  category: ServiceCategory;
  hq_status: HqStatus;
  created_at: string;
  customer?: { name: string; phone: string };
}

export interface DashboardStatsResponse {
  realtorCount: number;
  partnerCount: number;
  totalMembers: number;
  membersIncreaseThisMonth: number;
  thisMonthRequests: number;
  lastMonthRequests: number;
  requestDiff: number;
  completedCount: number;
  conversionRate: number;
  thisMonthSettlementAmount: number;
  unassignedCount: number;
  pendingWithdrawals: number;
  accountPendingCount: number;
  newSignupsCount: number;
  inquiryPendingCount: number;
  categoryStats: Record<string, { total: number; unassigned: number }>;
  topRealtors: { business_name: string; conversionCount: number; amount?: number }[];
  cancelledAssignmentsCount?: number;
  partnerApplicationPendingCount?: number;
  complaintCount?: number;
  /** Smart Assist: 미수금 총액 (제휴업체 전체) */
  receivableTotal?: number;
  /** Smart Assist: 미수 건수 */
  receivableCount?: number;
}
