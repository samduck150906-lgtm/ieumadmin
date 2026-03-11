// 회원 유형
export type UserRole = 'realtor' | 'partner' | 'staff' | 'admin';
export type UserStatus = 'active' | 'inactive' | 'suspended' | 'terminated';

// 서비스 카테고리
export type ServiceCategory =
  | 'realtor'          // 공인중개사
  | 'moving'           // 이사
  | 'cleaning'         // 입주청소
  | 'internet_tv'      // 인터넷 & TV
  | 'appliance_rental' // 가전렌탈
  | 'kiosk'            // 키오스크
  | 'interior';        // 인테리어

export const SERVICE_CATEGORY_LABELS: Record<string, string> = {
  realtor: '공인중개사',
  moving: '이사',
  cleaning: '입주청소',
  internet_tv: '인터넷·TV',
  interior: '인테리어',
  appliance_rental: '가전렌탈',
  kiosk: '키오스크',
};

// 본사 상태
export type HqStatus =
  | 'unread'           // 미배정
  | 'read'             // 열람
  | 'assigned'         // 배정완료
  | 'settlement_check' // 정산확인
  | 'settlement_done'  // 정산완료
  | 'cancelled'        // 취소
  | 'hq_review_needed'; // 본사확인필요

export const HQ_STATUS_LABELS: Record<HqStatus, string> = {
  unread: '미배정',
  read: '열람',
  assigned: '배정완료',
  settlement_check: '정산확인',
  settlement_done: '정산완료',
  cancelled: '취소',
  hq_review_needed: '본사확인필요',
};

/** StatusBadge variant 매핑 (본사 상태) */
export const HQ_STATUS_VARIANTS: Record<HqStatus, 'red' | 'blue' | 'yellow' | 'purple' | 'green' | 'orange' | 'gray'> = {
  unread: 'red',
  read: 'blue',
  assigned: 'yellow',
  settlement_check: 'purple',
  settlement_done: 'green',
  hq_review_needed: 'orange',
  cancelled: 'gray',
};

// 제휴업체 상태
export type PartnerStatus = 
  | 'unread'      // 미열람
  | 'read'        // 열람
  | 'consulting'  // 상담예정
  | 'cancelled'   // 취소
  | 'reserved'    // 예약완료
  | 'completed'   // 전체완료
  | 'pending';   // 보류

export const PARTNER_STATUS_LABELS: Record<PartnerStatus, string> = {
  unread: '미열람',
  read: '열람',
  consulting: '상담예정',
  cancelled: '취소',
  reserved: '예약완료',
  completed: '전체완료',
  pending: '보류',
};

// 이사형태 (포장/반포장/용달(화물))
export type MovingType = 'general' | 'full_pack' | 'half_pack' | 'cargo';
export const MOVING_TYPE_LABELS: Record<MovingType, string> = {
  general: '일반이사',
  full_pack: '포장',
  half_pack: '반포장',
  cargo: '용달(화물)',
};

// PHASE 3 호환: 동일 키 라벨 (regular/package/semi)
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

// 평수 (이사 가격 4단계: ~10/~20/~30/30+ + 기존 호환)
export type AreaSize =
  | 'under_10'        // ~10평 (이사 가격용)
  | 'under_20'       // ~20평
  | 'under_30'       // ~30평
  | 'over_30'        // 30평 이상
  | 'under_12'       // 기존 호환
  | 'between_12_20'
  | 'over_20';

export const AREA_SIZE_LABELS: Record<string, string> = {
  under_10: '~10평',
  under_20: '~20평',
  under_30: '~30평',
  over_30: '30평 이상',
  under_12: '12평 이하',
  between_12_20: '12평~20평',
  over_20: '20평 이상',
};

/** 이사 가격 설정용 4단계만 */
export const AREA_SIZE_MOVING_TIERS: AreaSize[] = ['under_10', 'under_20', 'under_30', 'over_30'];

// 평점
export type RatingType = 'satisfied' | 'normal' | 'unsatisfied';

export const RATING_LABELS: Record<RatingType, string> = {
  satisfied: '만족',
  normal: '보통',
  unsatisfied: '불만',
};

// 출금 상태
export type WithdrawalStatus = 'requested' | 'approved' | 'completed' | 'rejected';

export const WITHDRAWAL_STATUS_LABELS: Record<WithdrawalStatus, string> = {
  requested: '신청',
  approved: '승인',
  completed: '완료',
  rejected: '반려',
};

// 결제 상태
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

// ==========================================
// 대시보드 / API 응답 타입
// ==========================================

export interface DashboardStats {
  totalRequests: number;
  unreadRequests: number;
  assignedRequests: number;
  completedRequests: number;
  todayRequests: number;
  activePartners: number;
  activeRealtors: number;
  totalCommissions: number;
  pendingWithdrawals: number;
}

/** 날짜 필터 (카테고리별 상담현황용) */
export type DashboardDateFilter =
  | 'this_month'   // 당월
  | 'last_month'   // 전월
  | 'last_7_days'  // 최근 7일
  | 'today'        // 오늘
  | 'yesterday';   // 어제

/** 카테고리별 상담현황 상태별 건수 */
export interface CategoryStatBreakdown {
  total: number;
  unassigned: number;      // 미배정
  inProgress: number;      // 진행중(열람)
  reserved: number;        // 예약완료
  delayed: number;         // 지연중(구매DB 24h 경과)
  settlement_check: number;
  settlement_done: number;
}

/** 대시보드 API 실제 반환형 (getDashboardStats) */
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
  categoryStats: Record<string, { total: number; unassigned: number } | CategoryStatBreakdown>;
  topRealtors: { business_name: string; conversionCount: number; amount?: number }[];
  /** 신규가입 다분화 */
  realtorNewSignupsCount?: number;
  partnerApplicationPendingCount?: number;
  /** 2주 이상 미활동 공인중개사 수 (활동 = 로그인 OR 고객 신청) */
  inactiveRealtorCount?: number;
  /** 재정 요약 (당월) */
  financialSummary?: FinancialSummary;
}

/** 재정 요약 (당월 기준) */
export interface FinancialSummary {
  // 핵심 지표
  unpaidAmount: number;                     // 미수금액 (전체 미납)
  unpaidCount: number;                      // 미수 건수
  settlementAmount: number;                 // 정산액 (당월 출금완료)
  realtorAssignmentAmount: number;          // 공인중개사 배정액(예상)
  realtorAssignmentCount: number;           // 배정 건수
  realtorMonthlyClaimAmount: number;        // 공인중개사 당월 청구액 (신청+승인)
  realtorClaimCompletedAmount: number;      // 공인중개사 출금 완료액 (당월)
  realtorClaimPendingCount: number;         // 출금 대기 건수 (신청+승인)
  expectedProfitAfterDeduction: number;     // 공제 후 순수익 예상

  // 미수금 납부 현황 (당월)
  totalReceivableThisMonth: number;         // 당월 발생 미수 총액
  paidReceivableThisMonth: number;          // 당월 납부 완료 미수액

  // 전월 비교 (트렌드용)
  prevMonthSettlementAmount: number;        // 전월 정산액
  prevMonthUnpaidAmount: number;            // 전월 미수금액
}

/** 진행중 취소/불만 건 목록 항목 */
export interface CancelledOrComplaintItem {
  id: string;
  category: ServiceCategory;
  hq_status: HqStatus;
  created_at: string;
  customer?: { name: string; phone: string };
  reason?: 'cancelled' | 'complaint';
  rating?: RatingType;
  partner_name?: string;
}

/** 제휴업체 평점/불만순 목록 항목 */
export interface PartnerRatingListItem {
  id: string;
  business_name: string;
  service_categories: ServiceCategory[];
  avg_rating: number;
  total_reviews: number;
  unsatisfied_count: number;
}

/** 제휴업체 전환률 목록 항목 (전환률 낮은순) */
export interface PartnerConversionListItem {
  id: string;
  business_name: string;
  service_categories: ServiceCategory[];
  assigned_count: number;
  reserved_count: number;
  conversion_rate: number;
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

/** 최근 서비스 요청 목록 항목 (customer joined) */
export interface RecentRequestItem {
  id: string;
  category: ServiceCategory;
  hq_status: HqStatus;
  created_at: string;
  customer?: { name: string; phone: string };
}

// ==========================================
// 테이블 타입
// ==========================================

export interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  profile_image: string | null;
  created_at: string;
  updated_at: string;
  /** 마지막 로그인 시각 (auth.users 동기화, 2주 미활동 판단용) */
  last_sign_in_at?: string | null;
  /** Expo Push Token (앱 푸시 발송용) */
  expo_push_token?: string | null;
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
  /** 수익금 증가 시 푸시 알림 수신 여부 (realtors.notify_commission_increase) */
  notify_commission_increase?: boolean;
  /** 고객 상담 요청 시 푸시 알림 수신 여부 (realtors.notify_consultation_request) */
  notify_consultation_request?: boolean;
  /** 정산 완료 시 푸시 알림 수신 여부 (realtors.notify_settlement_complete) */
  notify_settlement_complete?: boolean;
  last_excel_downloaded_at: string | null;
  last_excel_downloaded_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
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
  // joined
  user?: User;
}

/** 직원 역할: 관리자 / 서브관리자 / 회계 / CS */
export type StaffRole = 'admin' | 'sub_admin' | 'accounting' | 'cs';

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: '관리자',
  sub_admin: '서브관리자',
  accounting: '회계',
  cs: 'CS',
};

export interface Staff {
  id: string;
  user_id: string;
  department: string | null;
  position: string | null;
  is_admin: boolean;
  /** 정산 담당자 여부. true인 직원만 출금 승인/완료/반려 가능 (관리자 제외). 마이그레이션 적용 전에는 undefined */
  can_approve_settlement?: boolean;
  /** 직원 역할 (admin/sub_admin/accounting/cs). 있으면 이 값 기준으로 is_admin·can_approve_settlement 해석 */
  staff_role?: StaffRole | null;
  created_at: string;
  updated_at: string;
  // joined
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
  // joined
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
  requested_product: string | null;
  created_at: string;
  updated_at: string;
  // joined
  customer?: Customer;
  assigned_partner?: Partner;
  partner_assignment?: PartnerAssignment;
}

/** 서비스요청 통합 메모 (memos 테이블, entity_type='service_request') */
export interface ServiceRequestMemo {
  id: string;
  entity_type: string;
  entity_id: string;
  content: string;
  created_by: string | null;
  created_at: string;
  created_by_user?: { name?: string; email?: string } | null;
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
  customer_payment_amount: number | null;
  support_amount: number | null;
  support_amount_promise: string | null;
  created_at: string;
  updated_at: string;
  // joined
  service_request?: ServiceRequest;
  partner?: Partner;
}

export interface Commission {
  id: string;
  realtor_id: string;
  commission_type: 'conversion' | 'consultation' | 'referral';
  service_request_id: string | null;
  referred_realtor_id: string | null;
  amount: number;
  is_settled: boolean;
  settled_at: string | null;
  withdrawal_id: string | null;
  created_at: string;
  // joined
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
  // joined
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
  // joined
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

// 협력업체 신청
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

// DB 가격 (이사)
export interface DbPriceMoving {
  id: string;
  area_size: AreaSize;
  moving_type: MovingType;
  view_price: number;
  complete_price: number;
  created_at: string;
  updated_at: string;
}

// DB 가격 (청소)
export interface DbPriceCleaning {
  id: string;
  price_per_pyeong: number;
  consultation_fee?: number;
  view_price?: number;
  max_completion_fee?: number | null;
  created_at: string;
  updated_at: string;
}

// DB 가격 (인터넷)
export type InternetType = 'internet_only' | 'internet_tv';
export interface DbPriceInternet {
  id: string;
  internet_type: InternetType;
  view_price: number;
  complete_price: number;
  created_at: string;
  updated_at: string;
}
