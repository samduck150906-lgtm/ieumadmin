/**
 * 카카오 알림톡 + 알리고 SMS 연동 모듈
 *
 * 필요 환경변수:
 * ALIGO_API_KEY — 알리고 API 키
 * ALIGO_USER_ID — 알리고 사용자 ID
 * ALIGO_SENDER — 발신번호 (080 수신거부 연동)
 * KAKAO_SENDER_KEY — 카카오 비즈니스 채널 발신 프로필 키
 */

const ALIGO_API_URL = 'https://kakaoapi.aligo.in/akv10';
const ALIGO_SMS_URL = 'https://apis.aligo.in/send/';

interface AlimtalkParams {
  phone: string;
  templateCode: string;
  variables: Record<string, string>;
  // fallback SMS: 알림톡 실패 시 대체 문자
  fallbackMessage?: string;
}

interface SmsParams {
  phone: string;
  message: string;
  title?: string; // LMS 제목 (90byte 초과 시 자동 LMS)
}

/**
 * 카카오 알림톡 발송
 */
export async function sendAlimtalk(params: AlimtalkParams): Promise<{ success: boolean; error?: string }> {
  const { phone, templateCode, variables, fallbackMessage } = params;

  const apiKey = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const senderKey = process.env.KAKAO_SENDER_KEY;

  if (!apiKey || !userId || !senderKey) {
    console.error('[알림톡] 환경변수 미설정: ALIGO_API_KEY, ALIGO_USER_ID, KAKAO_SENDER_KEY');
    // 환경변수 미설정 시 로그만 남기고 실패 반환 (서비스 중단 방지)
    return { success: false, error: '알림톡 설정 미완료' };
  }

  try {
    const formData = new FormData();
    formData.append('apikey', apiKey);
    formData.append('userid', userId);
    formData.append('senderkey', senderKey);
    formData.append('tpl_code', templateCode);
    formData.append('sender', process.env.ALIGO_SENDER || '');
    formData.append('receiver_1', phone.replace(/[^0-9]/g, ''));
    formData.append('recvname_1', variables.name || '고객');

    // 템플릿 변수를 subject_1에 JSON으로 전달
    // 알리고 API는 #{변수명} 형태로 템플릿에 치환
    const subjectVars = Object.entries(variables)
      .map(([key, val]) => `#{${key}}=${val}`)
      .join('|');
    formData.append('subject_1', subjectVars);

    // 대체 문자 (알림톡 실패 시)
    if (fallbackMessage) {
      formData.append('failover', 'Y');
      formData.append('fsubject_1', '[이음]');
      formData.append('fmessage_1', fallbackMessage);
    }

    const response = await fetch(`${ALIGO_API_URL}/alimtalk/send/`, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.code === 0) {
      return { success: true };
    } else {
      console.error('[알림톡 발송 실패] code:', result.code, 'message:', result.message);
      return { success: false, error: result.message || '발송 실패' };
    }
  } catch (error) {
    console.error('[알림톡 에러]:', error);
    return { success: false, error: '네트워크 오류' };
  }
}

/**
 * SMS/LMS 발송 (알리고)
 */
export async function sendSms(params: SmsParams): Promise<{ success: boolean; error?: string }> {
  const { phone, message, title } = params;

  const apiKey = process.env.ALIGO_API_KEY;
  const userId = process.env.ALIGO_USER_ID;
  const sender = process.env.ALIGO_SENDER;

  if (!apiKey || !userId || !sender) {
    console.error('[SMS] 환경변수 미설정');
    return { success: false, error: 'SMS 설정 미완료' };
  }

  try {
    const formData = new FormData();
    formData.append('key', apiKey);
    formData.append('user_id', userId);
    formData.append('sender', sender);
    formData.append('receiver', phone.replace(/[^0-9]/g, ''));
    formData.append('msg', message);
    if (title) formData.append('title', title);
    // 90byte 초과 시 자동 LMS
    formData.append('msg_type', new Blob([message]).size > 90 ? 'LMS' : 'SMS');

    const response = await fetch(ALIGO_SMS_URL, {
      method: 'POST',
      body: formData,
    });

    const result = await response.json();

    if (result.result_code === '1') {
      return { success: true };
    } else {
      console.error('[SMS 발송 실패] result_code:', result.result_code, 'message:', result.message);
      return { success: false, error: result.message || '발송 실패' };
    }
  } catch (error) {
    console.error('[SMS 에러]:', error);
    return { success: false, error: '네트워크 오류' };
  }
}
