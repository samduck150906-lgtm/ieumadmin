/**
 * 알림톡 템플릿 코드 + 메시지 정의
 *
 * ★ 중요: 아래 templateCode는 카카오 비즈니스 채널에서 실제 등록 후
 *   승인받은 코드로 교체해야 합니다. (승인 영업일 3~7일 소요)
 *
 * 카카오 알림톡 템플릿 등록 방법:
 * 1. 카카오 비즈니스 채널 관리자 접속
 * 2. 알림톡 > 템플릿 관리 > 신규 등록
 * 3. 아래 메시지를 템플릿으로 등록 (#{변수명} 형태)
 * 4. 승인 후 templateCode를 실제 코드로 교체
 */

/** 플랫폼 표시명 (가칭 → 정식 명칭 확정 시 이 값만 교체) */
export const PLATFORM_NAME = '이음';

export const NOTIFICATION_TEMPLATES = {
  // === 고객용 ===

  /** 최초 유입 · 신청 완료 */
  CUSTOMER_APPLY_COMPLETE: {
    templateCode: 'IEUM_APPLY_001', // ← 실제 승인 코드로 교체
    buildMessage: (vars: { name: string; services: string }) =>
      `'${PLATFORM_NAME}'에서\n\n${vars.services}\n\n신청이 완료되었습니다.\n\n최대 24시간 이내 각 전문가에게 연락이 갈 예정입니다.`,
    buildVariables: (vars: { name: string; services: string }) => ({
      name: vars.name,
      services: vars.services,
    }),
  },

  /** 업체 배정 (카테고리별 개별 발송) — 고객에게 */
  CUSTOMER_PARTNER_ASSIGNED: {
    templateCode: 'IEUM_ASSIGN_001',
    buildMessage: (vars: {
      category: string;
      partnerName: string;
      managerName: string;
      managerPhone: string;
    }) =>
      `[이음] '${vars.category}' 업체 '${vars.partnerName}'이(가) 배정되었습니다.\n담당자: ${vars.managerName}\n연락처: ${vars.managerPhone}\n\n빠른 시간 안에 위 담당자로부터 연락이 갈 예정입니다.\n감사합니다.`,
    buildVariables: (vars: {
      category: string;
      partnerName: string;
      managerName: string;
      managerPhone: string;
    }) => vars,
  },

  /** 신규 배정 — 제휴업체에게 (고객 정보 안내) */
  PARTNER_NEW_ASSIGNMENT: {
    templateCode: 'IEUM_PARTNER_NEW_001',
    buildMessage: (vars: {
      customerName: string;
      customerPhone: string;
      category: string;
      movingDate: string;
      address: string;
    }) =>
      `[이음] 새로운 고객이 배정되었습니다.\n\n고객: ${vars.customerName}\n연락처: ${vars.customerPhone}\n카테고리: ${vars.category}\n이사일: ${vars.movingDate}\n주소: ${vars.address}\n\n빠른 연락 부탁드립니다.`,
    buildVariables: (vars: {
      customerName: string;
      customerPhone: string;
      category: string;
      movingDate: string;
      address: string;
    }) => vars,
  },

  /** 취소 확인 */
  CUSTOMER_CANCELLED: {
    templateCode: 'IEUM_CANCEL_001',
    buildMessage: (vars: { cancelledItems: string }) =>
      `'${vars.cancelledItems}' 신청을 취소하셨군요.\n\n취소 이유를 알려주시면 보다 나은 서비스로 보답하겠습니다.\n(다른곳에서 신청 / 이사가 취소됨 / 보류중 / 기타사유)`,
    buildVariables: (vars: { cancelledItems: string }) => vars,
  },

  /** 전체 완료 + 평점 요청 (업체에서 전체 완료 시) */
  CUSTOMER_COMPLETED: {
    templateCode: 'IEUM_COMPLETE_001',
    buildMessage: (vars: { services: string; reviewUrl: string }) =>
      `'${vars.services}'이(가) 완료되었습니다.\n\n평점 및 후기를 남겨주세요.\n${vars.reviewUrl}`,
    buildVariables: (vars: { services: string; reviewUrl: string }) => vars,
  },

  /** 예약일정 변경 알림 */
  CUSTOMER_RESERVATION_UPDATED: {
    templateCode: 'IEUM_RESERV_001',
    buildMessage: (vars: { services: string; reservationDate: string }) =>
      `'${vars.services}' 예약일정이 ${vars.reservationDate}(으)로 변경되었습니다. 확인해 주세요.`,
    buildVariables: (vars: { services: string; reservationDate: string }) => vars,
  },

  /** 예약 D-1 리마인더 (크론잡: 매일 오전 9시) */
  CUSTOMER_RESERVATION_REMINDER: {
    templateCode: 'IEUM_RESERV_002',
    buildMessage: (vars: { services: string; reservationDate: string; partnerName: string }) =>
      `내일(${vars.reservationDate}) '${vars.services}' 예약이 있습니다. 담당 업체: ${vars.partnerName}. 일정을 확인해 주세요.`,
    buildVariables: (vars: { services: string; reservationDate: string; partnerName: string }) => vars,
  },

  /** 방문상담 D-1 리마인더 (크론잡: 매일 오전 9시) */
  CUSTOMER_VISIT_REMINDER: {
    templateCode: 'IEUM_VISIT_001',
    buildMessage: (vars: { customerName: string; reservationDate: string; partnerName: string; services: string }) =>
      `[이음] ${vars.customerName}님, 내일(${vars.reservationDate}) "${vars.partnerName}" 담당자가 ${vars.services} 방문상담을 위해 방문 예정입니다. 문의: 이음 고객센터`,
    buildVariables: (vars: { customerName: string; reservationDate: string; partnerName: string; services: string }) => vars,
  },

  // === 제휴업체용 (본사 → 제휴업체) ===

  /**
   * DB배정 후 익일 12시까지 예약완료 미전환 시 (매일 정오)
   * 업체 응답: 예약완료 → 예약일자 기록 / 상담예정 → 12시·17시 동일 알림 반복 / 취소 → 취소사유 입력
   */
  PARTNER_UNPROCESSED: {
    templateCode: 'IEUM_PARTNER_001',
    buildMessage: (vars: { customerName: string; customerPhone: string; appLink?: string }) =>
      `'${vars.customerName}'\n'${vars.customerPhone}'\n\n고객님이 연락을 기다립니다.\n혹시 예약을 했다면 예약 일자를 기입해주세요.\n취소되었다면 사유를 남겨주세요.\n\n(예약완료 / 상담예정 / 취소)${vars.appLink ? `\n\n👉 앱에서 처리: ${vars.appLink}` : ''}`,
    buildVariables: (vars: { customerName: string; customerPhone: string; appLink?: string }) => vars,
  },

  /**
   * 상담예정 리마인더 (매일 12시, 17시)
   * 예약완료로 전환되기 전까지 반복 발송
   */
  PARTNER_CONSULTING_REMINDER: {
    templateCode: 'IEUM_PARTNER_002',
    buildMessage: (vars: { customerName: string; customerPhone: string; appLink?: string }) =>
      `'${vars.customerName}'\n'${vars.customerPhone}'\n\n고객님이 연락을 기다립니다.\n혹시 예약을 했다면 예약 일자를 기입해주세요.\n취소되었다면 사유를 남겨주세요.\n\n(예약완료 / 상담예정 / 취소)${vars.appLink ? `\n\n👉 앱에서 처리: ${vars.appLink}` : ''}`,
    buildVariables: (vars: { customerName: string; customerPhone: string; appLink?: string }) => vars,
  },

  /**
   * 예약완료 날짜 익일(D+1)까지 전체완료 미전환 시
   * 업체 응답: 완료 → 전체완료 상태 변경 / 미처리 사유 입력 → 본사확인필요(신규)+업체 보류 전환
   */
  PARTNER_RESERVATION_OVERDUE: {
    templateCode: 'IEUM_PARTNER_003',
    buildMessage: (vars: {
      customerName: string;
      customerPhone: string;
      reservationDate: string;
      appLink?: string;
    }) =>
      `'${vars.customerName}'\n'${vars.customerPhone}'\n'${vars.reservationDate}'\n\n해당 내용이 잘 처리되었나요?\n처리 되었다면 완료를 눌러주세요.(완료시 전체완료로 상태변경)\n처리되지 않았다면 사유를 적어주세요.\n(본사 확인필요 상태로 전환, 업체상태 보류)${vars.appLink ? `\n\n👉 앱에서 처리: ${vars.appLink}` : ''}`,
    buildVariables: (vars: {
      customerName: string;
      customerPhone: string;
      reservationDate: string;
      appLink?: string;
    }) => vars,
  },

  /** 제휴업체 내일 예약 알림 (예약 D-1, 매일 오전 9시 크론) */
  PARTNER_RESERVATION_REMINDER: {
    templateCode: 'IEUM_PARTNER_004',
    buildMessage: (vars: {
      reservationDate: string;
      customerName: string;
      customerPhone: string;
      services: string;
    }) =>
      `[이음] 내일(${vars.reservationDate}) '${vars.customerName}' 고객님 ${vars.services} 예약이 있습니다.\n연락처: ${vars.customerPhone}\n\n일정 확인해 주세요.`,
    buildVariables: (vars: {
      reservationDate: string;
      customerName: string;
      customerPhone: string;
      services: string;
    }) => vars,
  },

  // === 공인중개사 수익 알림 ===

  /** 수익 변동 알림 (예정/전환/추천 수익금 변동 시) */
  REALTOR_REVENUE_CHANGE: {
    templateCode: 'IEUM_REVENUE_001',
    buildMessage: (vars: { realtorName: string; revenueType: string; amount: string }) =>
      `[이음] ${vars.realtorName}님, ${vars.revenueType}이 +${vars.amount}원 변동되었습니다. 앱에서 확인해 주세요.`,
    buildVariables: (vars: { realtorName: string; revenueType: string; amount: string }) => vars,
  },

  // === 공인중개사 가망고객용 ===

  /** 가망고객 Kakao 알림톡 (이사/청소/인테리어 등 소개 + 폼 링크) */
  REALTOR_PROSPECT_ALIMTALK: {
    templateCode: 'IEUM_PROSPECT_001',
    buildMessage: (vars: { name: string; business_name: string; form_link: string }) =>
      `안녕하세요 ${vars.name}님, "${vars.business_name}"입니다.\n이사, 청소, 인테리어, 인터넷이전 등 한번에 알아보실 수 있는 플랫폼이 있어 소개해 드립니다. 아래 링크에서 상담 신청해 주세요.\n${vars.form_link}`,
    buildVariables: (vars: { name: string; business_name: string; form_link: string }) => vars,
  },

  /** 공인중개사 수수료 정산 완료 */
  REALTOR_COMMISSION_SETTLED: {
    templateCode: 'IEUM_REALTOR_001',
    buildMessage: (vars: { realtorName: string; amount: string; period: string }) =>
      `[이음] ${vars.realtorName}님, ${vars.period} 수수료 ${vars.amount}이 정산되었습니다. 출금 신청은 마이페이지에서 가능합니다.`,
    buildVariables: (vars: { realtorName: string; amount: string; period: string }) => vars,
  },

  /** 공인중개사 출금 완료 */
  REALTOR_WITHDRAWAL_COMPLETE: {
    templateCode: 'IEUM_REALTOR_002',
    buildMessage: (vars: { realtorName: string; amount: string; bankName: string; accountNumber: string }) =>
      `[이음] ${vars.realtorName}님, ${vars.amount} 출금이 완료되었습니다.\n\n입금 계좌: ${vars.bankName} ${vars.accountNumber}`,
    buildVariables: (vars: { realtorName: string; amount: string; bankName: string; accountNumber: string }) => vars,
  },

  /** 공인중개사 출금 반려 */
  REALTOR_WITHDRAWAL_REJECTED: {
    templateCode: 'IEUM_REALTOR_003',
    buildMessage: (vars: { realtorName: string; amount: string; reason: string }) =>
      `[이음] ${vars.realtorName}님, ${vars.amount} 출금 신청이 반려되었습니다.\n사유: ${vars.reason}\n\n확인 후 다시 신청해 주세요.`,
    buildVariables: (vars: { realtorName: string; amount: string; reason: string }) => vars,
  },

  /** 예약일+1일 고객 업무처리 확인 (12시 크론: 해당 건이 처리되었는지 고객에게 확인 요청) */
  CUSTOMER_WORK_CONFIRM: {
    templateCode: 'IEUM_CUSTOMER_WORK_001',
    buildMessage: (vars: { services: string; reservationDate: string }) =>
      `[이음] 안녕하세요. '${vars.services}' 예약(${vars.reservationDate})이 잘 진행되었는지 확인해 주시겠어요? 문의사항이 있으시면 담당 업체에 연락해 주세요.`,
    buildVariables: (vars: { services: string; reservationDate: string }) => vars,
  },

  /** 지연 DB 배정 해제 시 제휴업체에게 발송 (24시간 경과 미처리로 배정 해제됨 안내) */
  PARTNER_DELAYED_UNASSIGN: {
    templateCode: 'IEUM_PARTNER_DELAYED_001',
    buildMessage: (vars: { customerName: string; category: string }) =>
      `[이음] 배정된 DB(고객: ${vars.customerName}, ${vars.category})가 24시간 동안 미처리되어 배정이 해제되었습니다. 타 업체가 구매할 수 있습니다.`,
    buildVariables: (vars: { customerName: string; category: string }) => vars,
  },

  // === 시스템 공지 ===

  /** 시스템 공지사항 (전체/그룹 발송) */
  SYSTEM_NOTICE: {
    templateCode: 'IEUM_SYSTEM_001',
    buildMessage: (vars: { title: string; body: string }) =>
      `[이음] ${vars.title}\n\n${vars.body}`,
    buildVariables: (vars: { title: string; body: string }) => vars,
  },
} as const;

export type NotificationTemplateKey = keyof typeof NOTIFICATION_TEMPLATES;
