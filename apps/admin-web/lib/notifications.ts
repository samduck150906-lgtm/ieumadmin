import { getSupabaseOrServer } from './supabase';

// 알리고 SMS / 카카오 알림톡 API (서버 전용 - NEXT_PUBLIC 사용 금지, 브라우저 노출 방지)
const ALIGO_API_URL = 'https://apis.aligo.in';
const ALIGO_API_KEY = process.env.ALIGO_API_KEY || '';
const ALIGO_USER_ID = process.env.ALIGO_USER_ID || '';
const ALIGO_SENDER = process.env.ALIGO_SENDER || '';
const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY || '';
const KAKAO_SENDER_KEY = process.env.KAKAO_SENDER_KEY || '';

// 플랫폼 표시명 (가칭 → 정식 명칭 확정 시 이 값만 교체)
const PLATFORM_NAME = '이음';

// 알림 템플릿 (클라이언트 확정 문구 반영 — 2026.02.04 수정본)
export const TEMPLATES = {
  // 최초 유입: '이음' 에서 (신청시) 이사, 입주청소, 인터넷&TV 등 신청이 완료되었습니다.
  signup_complete: {
    code: 'signup_complete',
    title: '신청 완료',
    template: `'${PLATFORM_NAME}'에서\n\n{{서비스목록}}\n\n신청이 완료되었습니다.\n\n최대 24시간 이내 각 전문가에게 연락이 갈 예정입니다.`,
  },
  // 업체 배정: '이사' 업체 '업체명'이(가) 배정되었습니다. '담당자 명' '담당자 연락처' 빠른 시간안에...
  partner_assigned: {
    code: 'partner_assigned',
    title: '업체 배정 완료',
    template: `[이음] '{{카테고리}}' 업체 '{{업체명}}'이(가) 배정되었습니다.\n담당자: {{담당자명}}\n연락처: {{담당자연락처}}\n\n빠른 시간 안에 위 담당자로부터 연락이 갈 예정입니다.\n감사합니다.`,
  },
  // 후기: '신청내역'이(가) 완료되었습니다. 평점 및 후기를 남겨주세요.
  review_request: {
    code: 'review_request',
    title: '후기 요청',
    template: `'{{신청내역}}'이(가) 완료되었습니다.\n\n평점 및 후기를 남겨주세요.`,
  },
  // 제휴업체 신규 배정
  partner_new_assignment: {
    code: 'partner_new_assignment',
    title: '신규 배정 알림 (업체)',
    template: `새로운 고객이 배정되었습니다.\n\n고객: {{고객명}}\n연락처: {{고객연락처}}\n카테고리: {{카테고리}}\n이사일: {{이사일}}\n주소: {{주소}}\n\n빠른 연락 부탁드립니다.`,
  },
  // DB배정 후 익일 12시까지 예약완료 안 됐을 때 → 제휴업체
  // 업체 응답: 예약완료 → 예약일자 기록 / 상담예정 → 12시·17시 동일 알림 반복 / 취소 → 사유 입력
  partner_reminder_not_reserved: {
    code: 'partner_reminder_not_reserved',
    title: '연락 대기 안내',
    template: `'{{고객명}}'\n'{{고객연락처}}'\n\n고객님이 연락을 기다립니다.\n혹시 예약을 했다면 예약 일자를 기입해주세요.\n취소되었다면 사유를 남겨주세요.\n\n(예약완료 / 상담예정 / 취소)`,
  },
  // 예약완료 D+1까지 전체완료 안 됐을 때 → 제휴업체
  // 업체 응답: 완료 → 전체완료 상태 변경 / 미처리 사유 → 본사확인필요(신규)+업체 보류 전환
  partner_reminder_not_completed: {
    code: 'partner_reminder_not_completed',
    title: '처리 확인 요청',
    template: `'{{고객명}}'\n'{{고객연락처}}'\n'{{예약일자}}'\n\n해당 내용이 잘 처리되었나요?\n처리 되었다면 완료를 눌러주세요.(완료시 전체완료로 상태변경)\n처리되지 않았다면 사유를 적어주세요.\n(본사 확인필요 상태로 전환, 업체상태 보류)`,
  },
  // 취소 시 고객: '(취소내역)' 신청을 취소하셨군요. 취소 이유를...
  cancelled: {
    code: 'cancelled',
    title: '취소 안내',
    template: `'{{취소내역}}' 신청을 취소하셨군요.\n\n취소 이유를 알려주시면 보다 나은 서비스로 보답하겠습니다.\n(다른곳에서 신청 / 이사가 취소됨 / 보류중 / 기타사유)`,
  },
  /** 관리자에서 제휴업체 생성 시 담당자에게 발송 */
  partner_signup_complete: {
    code: 'partner_signup_complete',
    title: '제휴업체 회원가입 완료',
    template: `[이음] '{{업체명}}' 제휴업체 계정이 생성되었습니다.\n담당자: {{담당자명}}\n\n아래 링크에서 로그인해 주세요.\n{{로그인URL}}`,
  },
  /** 공인중개사 초대 시 (앱/제휴업체에서 발송) */
  realtor_invite: {
    code: 'realtor_invite',
    title: '공인중개사 초대',
    template: `"{{업체명}}"에서 초대 문자가 발송되었어요.\n이음에서 고객이 이사, 청소, 인터넷이전, 인테리어를 신청하면 수익을 쉐어해드려요.\n\n어플 다운로드 및 회원가입: {{가입링크}}`,
  },
  withdrawal_complete: {
    code: 'withdrawal_complete',
    title: '출금 완료',
    template: `{{공인중개사명}}님, {{금액}} 출금이 완료되었습니다.\n\n입금 계좌: {{은행}} {{계좌번호}}`,
  },
};

// 알림톡 발송
export async function sendAlimtalk(params: {
  phone: string;
  name?: string;
  templateCode: string;
  variables: Record<string, string>;
  serviceRequestId?: string;
}) {
  const template = Object.values(TEMPLATES).find(t => t.code === params.templateCode);
  if (!template) return { success: false };

  // 변수 치환
  let message = template.template;
  Object.entries(params.variables).forEach(([key, value]) => {
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });

  try {
    // 실제 카카오 알림톡 API 호출
    if (KAKAO_REST_API_KEY && KAKAO_SENDER_KEY) {
      const response = await fetch(`${ALIGO_API_URL}/akv10/alimtalk/send/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          apikey: ALIGO_API_KEY,
          userid: ALIGO_USER_ID,
          senderkey: KAKAO_SENDER_KEY,
          tpl_code: params.templateCode,
          sender: ALIGO_SENDER,
          receiver_1: params.phone,
          subject_1: template.title,
          message_1: message,
        }),
      });

      const result = await response.json();

      // 발송 기록 저장
      await saveNotificationLog({
        phone: params.phone,
        name: params.name,
        type: params.templateCode,
        channel: 'alimtalk',
        message,
        serviceRequestId: params.serviceRequestId,
        isSent: result.result_code === '1',
        errorMessage: result.result_code !== '1' ? result.message : undefined,
      });

      return { success: result.result_code === '1' };
    }

    // API 키 없으면 SMS로 대체 발송
    return sendSMS({
      phone: params.phone,
      name: params.name,
      message,
      serviceRequestId: params.serviceRequestId,
    });
  } catch {
    // 실패 시 SMS로 대체
    return sendSMS({
      phone: params.phone,
      name: params.name,
      message,
      serviceRequestId: params.serviceRequestId,
    });
  }
}

// SMS 발송
export async function sendSMS(params: {
  phone: string;
  name?: string;
  message: string;
  serviceRequestId?: string;
}) {
  try {
    if (!ALIGO_API_KEY) {
      // API 키 없으면 로그만 저장
      await saveNotificationLog({
        phone: params.phone,
        name: params.name,
        type: 'sms',
        channel: 'sms',
        message: params.message,
        serviceRequestId: params.serviceRequestId,
        isSent: false,
        errorMessage: 'API 키가 설정되지 않았습니다.',
      });
      return { success: false };
    }

    // 80바이트 초과 시 LMS로 발송
    const isLMS = new Blob([params.message]).size > 80;

    const response = await fetch(`${ALIGO_API_URL}/send/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        key: ALIGO_API_KEY,
        userid: ALIGO_USER_ID,
        sender: ALIGO_SENDER,
        receiver: params.phone,
        msg: params.message,
        msg_type: isLMS ? 'LMS' : 'SMS',
      }),
    });

    const result = await response.json();

    await saveNotificationLog({
      phone: params.phone,
      name: params.name,
      type: 'sms',
      channel: isLMS ? 'lms' : 'sms',
      message: params.message,
      serviceRequestId: params.serviceRequestId,
      isSent: result.result_code === '1',
      errorMessage: result.result_code !== '1' ? result.message : undefined,
    });

    return { success: result.result_code === '1' };
  } catch (err) {
    await saveNotificationLog({
      phone: params.phone,
      name: params.name,
      type: 'sms',
      channel: 'sms',
      message: params.message,
      serviceRequestId: params.serviceRequestId,
      isSent: false,
      errorMessage: err instanceof Error ? err.message : 'SMS 발송 실패',
    });
    return { success: false };
  }
}

// 발송 기록 저장
async function saveNotificationLog(params: {
  phone: string;
  name?: string;
  type: string;
  channel: string;
  message: string;
  serviceRequestId?: string;
  isSent: boolean;
  errorMessage?: string;
}) {
  try {
    const supabase = getSupabaseOrServer();
    await supabase.from('notification_logs').insert({
      recipient_phone: params.phone,
      recipient_name: params.name,
      notification_type: params.type,
      channel: params.channel,
      message_content: params.message,
      service_request_id: params.serviceRequestId,
      is_sent: params.isSent,
      sent_at: params.isSent ? new Date().toISOString() : null,
      error_message: params.errorMessage,
    });
  } catch {
    // 로그 저장 실패 시 무시 (발송 시도는 완료)
  }
}

// === 알림 시나리오별 함수 ===

// 1. 고객 신청 완료 알림
export async function notifySignupComplete(
  customerPhone: string,
  customerName: string,
  serviceNames: string[]
) {
  return sendAlimtalk({
    phone: customerPhone,
    name: customerName,
    templateCode: 'signup_complete',
    variables: {
      '고객명': customerName,
      '서비스목록': serviceNames.join(', '),
    },
  });
}

// 2. 업체 배정 완료 → 고객에게
export async function notifyPartnerAssigned(
  customerPhone: string,
  category: string,
  partnerName: string,
  managerName: string,
  managerPhone: string,
  serviceRequestId: string
) {
  return sendAlimtalk({
    phone: customerPhone,
    templateCode: 'partner_assigned',
    variables: {
      '카테고리': category,
      '업체명': partnerName,
      '담당자명': managerName,
      '담당자연락처': managerPhone,
    },
    serviceRequestId,
  });
}

// 2-1. 제휴업체 회원가입 완료 → 담당자에게 (관리자에서 제휴업체 생성 시)
export async function notifyPartnerSignupComplete(
  partnerPhone: string,
  businessName: string,
  managerName: string,
  loginUrl: string
) {
  return sendAlimtalk({
    phone: partnerPhone,
    name: managerName,
    templateCode: 'partner_signup_complete',
    variables: {
      '업체명': businessName,
      '담당자명': managerName,
      '로그인URL': loginUrl,
    },
  });
}

// 3. 신규 배정 → 업체에게
export async function notifyPartnerNewAssignment(
  partnerPhone: string,
  customerName: string,
  customerPhone: string,
  category: string,
  movingDate: string,
  address: string,
  serviceRequestId: string
) {
  return sendAlimtalk({
    phone: partnerPhone,
    templateCode: 'partner_new_assignment',
    variables: {
      '고객명': customerName,
      '고객연락처': customerPhone,
      '카테고리': category,
      '이사일': movingDate || '미정',
      '주소': address || '미정',
    },
    serviceRequestId,
  });
}

// 4. 전체완료 시 고객에게 후기 요청 (신청내역 = 카테고리명 등)
export async function notifyReviewRequest(
  customerPhone: string,
  customerName: string,
  requestSummary: string,
  serviceRequestId: string
) {
  return sendAlimtalk({
    phone: customerPhone,
    name: customerName,
    templateCode: 'review_request',
    variables: {
      '신청내역': requestSummary,
    },
    serviceRequestId,
  });
}

// 5. DB배정 후 익일 12시까지 예약완료 안 됐을 때 → 제휴업체
//    (스케줄: 배정일+1일 12:00에 미예약 건에 대해 발송. 상담예정이면 12:00/17:00 동일 문구 반복 발송)
export async function notifyPartnerReminderNotReserved(
  partnerPhone: string,
  customerName: string,
  customerPhone: string,
  serviceRequestId?: string
) {
  return sendAlimtalk({
    phone: partnerPhone,
    templateCode: 'partner_reminder_not_reserved',
    variables: {
      '고객명': customerName,
      '고객연락처': customerPhone,
    },
    serviceRequestId,
  });
}

// 6. 예약완료 D+1까지 전체완료 안 됐을 때 → 제휴업체
//    (스케줄: 예약일+1일 자정 기준 미완료 건에 대해 발송 → 완료 누르면 전체완료, 사유 입력 시 본사확인필요+업체 보류)
export async function notifyPartnerReminderNotCompleted(
  partnerPhone: string,
  customerName: string,
  customerPhone: string,
  reservationDate: string,
  serviceRequestId?: string
) {
  return sendAlimtalk({
    phone: partnerPhone,
    templateCode: 'partner_reminder_not_completed',
    variables: {
      '고객명': customerName,
      '고객연락처': customerPhone,
      '예약일자': reservationDate,
    },
    serviceRequestId,
  });
}

// 7. 출금 완료 알림
export async function notifyWithdrawalComplete(
  realtorPhone: string,
  realtorName: string,
  amount: number,
  bankName: string,
  accountNumber: string
) {
  return sendAlimtalk({
    phone: realtorPhone,
    name: realtorName,
    templateCode: 'withdrawal_complete',
    variables: {
      '공인중개사명': realtorName,
      '금액': new Intl.NumberFormat('ko-KR').format(amount) + '원',
      '은행': bankName,
      '계좌번호': accountNumber,
    },
  });
}

// 8. 수수료 정산 완료 알림 → 공인중개사에게
export async function notifyCommissionSettled(
  realtorPhone: string,
  realtorName: string,
  amount: number,
  period: string
) {
  return sendAlimtalk({
    phone: realtorPhone,
    name: realtorName,
    templateCode: 'commission_settled',
    variables: {
      '공인중개사명': realtorName,
      '금액': new Intl.NumberFormat('ko-KR').format(amount) + '원',
      '정산기간': period,
    },
  });
}

// 9. 출금 반려 알림 → 공인중개사에게
export async function notifyWithdrawalRejected(
  realtorPhone: string,
  realtorName: string,
  amount: number,
  reason: string
) {
  return sendAlimtalk({
    phone: realtorPhone,
    name: realtorName,
    templateCode: 'withdrawal_rejected',
    variables: {
      '공인중개사명': realtorName,
      '금액': new Intl.NumberFormat('ko-KR').format(amount) + '원',
      '사유': reason,
    },
  });
}

// 10. 시스템 공지 알림
export async function notifySystemNotice(
  recipientPhone: string,
  recipientName: string,
  title: string,
  body: string
) {
  return sendAlimtalk({
    phone: recipientPhone,
    name: recipientName,
    templateCode: 'system_notice',
    variables: {
      '제목': title,
      '내용': body,
    },
  });
}

// === 명령어8: 실제 발송 없이 notification_logs만 기록하는 6종 함수 ===
function buildMessageFromTemplate(templateCode: string, variables: Record<string, string>): string {
  const template = Object.values(TEMPLATES).find(t => t.code === templateCode);
  if (!template) return '';
  let message = template.template;
  Object.entries(variables).forEach(([key, value]) => {
    message = message.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });
  return message;
}

/** 신청 완료 알림 — API 키 있으면 실제 발송(알림톡/SMS), 없으면 로그만 */
export async function sendSignupNotification(
  customerPhone: string,
  customerName: string,
  serviceNames: string[]
) {
  const res = await notifySignupComplete(customerPhone, customerName, serviceNames);
  if (!res.success) {
    const message = buildMessageFromTemplate('signup_complete', {
      '고객명': customerName,
      '서비스목록': serviceNames.join(', '),
    });
    await saveNotificationLog({
      phone: customerPhone,
      name: customerName,
      type: 'signup_complete',
      channel: 'alimtalk',
      message,
      isSent: false,
      errorMessage: '발송 실패(API 미설정 또는 오류)',
    });
  }
}

/** 업체 배정 완료 알림 - 고객에게. API 키 있으면 실제 발송 */
export async function sendAssignmentNotification(
  customerPhone: string,
  category: string,
  partnerName: string,
  managerName: string,
  managerPhone: string,
  serviceRequestId?: string
) {
  const res = await notifyPartnerAssigned(
    customerPhone,
    category,
    partnerName,
    managerName,
    managerPhone,
    serviceRequestId!
  );
  if (!res.success) {
    const message = buildMessageFromTemplate('partner_assigned', {
      '카테고리': category,
      '업체명': partnerName,
      '담당자명': managerName,
      '담당자연락처': managerPhone,
    });
    await saveNotificationLog({
      phone: customerPhone,
      type: 'partner_assigned',
      channel: 'alimtalk',
      message,
      serviceRequestId,
      isSent: false,
      errorMessage: '발송 실패',
    });
  }
}

/** 취소 안내 알림 — API 키 있으면 실제 발송. partnerName 있으면 취소내역에 업체명 포함(고객 취소 리스트에서 업체 내역 크로스 체크 가능) */
export async function sendCancellationNotification(
  customerPhone: string,
  cancelSummary: string,
  serviceRequestId?: string,
  partnerName?: string
) {
  const 취소내역 = partnerName
    ? `${cancelSummary} (배정 업체 '${partnerName}'에 의해 취소)`
    : cancelSummary;
  const res = await sendAlimtalk({
    phone: customerPhone,
    templateCode: 'cancelled',
    variables: { '취소내역': 취소내역 },
    serviceRequestId,
  });
  if (!res.success) {
    const message = buildMessageFromTemplate('cancelled', { '취소내역': 취소내역 });
    await saveNotificationLog({
      phone: customerPhone,
      type: 'cancelled',
      channel: 'alimtalk',
      message,
      serviceRequestId,
      isSent: false,
      errorMessage: '발송 실패',
    });
  }
}

/** 완료 후 후기 요청 알림 — API 키 있으면 실제 발송 */
export async function sendCompletionNotification(
  customerPhone: string,
  customerName: string,
  requestSummary: string,
  serviceRequestId?: string
) {
  const res = await notifyReviewRequest(customerPhone, customerName, requestSummary, serviceRequestId!);
  if (!res.success) {
    const message = buildMessageFromTemplate('review_request', { '신청내역': requestSummary });
    await saveNotificationLog({
      phone: customerPhone,
      name: customerName,
      type: 'review_request',
      channel: 'alimtalk',
      message,
      serviceRequestId,
      isSent: false,
      errorMessage: '발송 실패',
    });
  }
}

/** 제휴업체 리마인더 - 예약 미완료. API 키 있으면 실제 발송 */
export async function sendPartnerReminderNotification(
  partnerPhone: string,
  customerName: string,
  customerPhone: string,
  serviceRequestId?: string
) {
  const res = await notifyPartnerReminderNotReserved(partnerPhone, customerName, customerPhone, serviceRequestId);
  if (!res.success) {
    const message = buildMessageFromTemplate('partner_reminder_not_reserved', {
      '고객명': customerName,
      '고객연락처': customerPhone,
    });
    await saveNotificationLog({
      phone: partnerPhone,
      type: 'partner_reminder_not_reserved',
      channel: 'alimtalk',
      message,
      serviceRequestId,
      isSent: false,
      errorMessage: '발송 실패',
    });
  }
}

/** 제휴업체 리마인더 - 전체완료 미처리. API 키 있으면 실제 발송 */
export async function sendPartnerCompletionReminder(
  partnerPhone: string,
  customerName: string,
  customerPhone: string,
  reservationDate: string,
  serviceRequestId?: string
) {
  const res = await notifyPartnerReminderNotCompleted(
    partnerPhone,
    customerName,
    customerPhone,
    reservationDate,
    serviceRequestId
  );
  if (!res.success) {
    const message = buildMessageFromTemplate('partner_reminder_not_completed', {
      '고객명': customerName,
      '고객연락처': customerPhone,
      '예약일자': reservationDate,
    });
    await saveNotificationLog({
      phone: partnerPhone,
      type: 'partner_reminder_not_completed',
      channel: 'alimtalk',
      message,
      serviceRequestId,
      isSent: false,
      errorMessage: '발송 실패',
    });
  }
}
