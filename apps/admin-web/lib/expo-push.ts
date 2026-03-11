/**
 * Expo Push API — 앱 푸시 알림 발송
 *
 * 모바일 앱에 저장된 users.expo_push_token (ExponentPushToken[xxx]) 으로
 * Expo Push API를 통해 발송합니다. Android는 FCM, iOS는 APNs로 Expo가 전달합니다.
 *
 * FCM 연동: docs/Firebase_FCM_푸시_연동_가이드.md
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
  priority?: 'default' | 'normal' | 'high';
  ttl?: number;
}

export interface ExpoPushResult {
  success: boolean;
  id?: string;
  error?: 'DeviceNotRegistered' | 'InvalidCredentials' | 'MessageTooBig' | 'MessageRateExceeded' | 'InvalidProviderToken';
  message?: string;
}

/**
 * 단일 푸시 발송
 * @param message - to: Expo Push Token (ExponentPushToken[xxx]), title, body, data(앱 내 라우팅용 url 등)
 * @returns 발송 요청 결과 (Expo API 응답 구조)
 */
export async function sendExpoPush(message: ExpoPushMessage): Promise<ExpoPushResult> {
  const token = message.to?.trim();
  if (!token || (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken['))) {
    return { success: false, error: 'InvalidCredentials', message: '유효한 Expo Push Token이 아닙니다.' };
  }

  try {
    const body = {
      to: token,
      title: message.title ?? '',
      body: message.body ?? '',
      data: message.data ?? {},
      sound: message.sound ?? 'default',
      ...(message.badge != null && { badge: message.badge }),
      ...(message.channelId && { channelId: message.channelId }),
      ...(message.priority && { priority: message.priority }),
      ...(message.ttl != null && { ttl: message.ttl }),
    };

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as { data?: { status: string; id?: string; message?: string; details?: { error?: string } }; errors?: Array<{ code: string; message?: string }> };

    if (data.errors?.length) {
      const err = data.errors[0];
      return {
        success: false,
        error: (err.code as ExpoPushResult['error']) ?? 'InvalidCredentials',
        message: err.message ?? err.code,
      };
    }

    const status = data.data?.status;
    if (status === 'ok') {
      return { success: true, id: data.data?.id };
    }

    return {
      success: false,
      error: (data.data?.details?.error as ExpoPushResult['error']) ?? 'InvalidCredentials',
      message: data.data?.message ?? status ?? '발송 실패',
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : '네트워크 오류';
    return { success: false, error: 'InvalidCredentials', message };
  }
}

/**
 * 여러 토큰에 동일 메시지 발송 (Expo API는 한 요청에 여러 메시지 가능)
 * @param tokens - Expo Push Token 배열
 * @param title - 제목
 * @param body - 본문
 * @param data - data.payload (앱에서 data.url 등으로 라우팅)
 */
export async function sendExpoPushToMany(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<{ sent: number; failed: number; errors: Array<{ token: string; error?: string }> }> {
  const valid = tokens.filter((t) => t?.trim() && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[')));
  if (valid.length === 0) {
    return { sent: 0, failed: tokens.length, errors: tokens.map((t) => ({ token: t ?? '', error: 'Invalid token' })) };
  }

  try {
    const messages = valid.map((to) => ({
      to,
      title,
      body,
      data: data ?? {},
      sound: 'default' as const,
    }));

    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(messages),
    });

    const json = (await res.json()) as { data?: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }> };
    const results = json.data ?? [];
    let sent = 0;
    const errors: Array<{ token: string; error?: string }> = [];
    results.forEach((r, i) => {
      if (r.status === 'ok') {
        sent += 1;
      } else {
        errors.push({ token: valid[i] ?? '', error: r.message ?? r.details?.error ?? r.status });
      }
    });
    return { sent, failed: results.length - sent, errors };
  } catch (e) {
    const message = e instanceof Error ? e.message : '네트워크 오류';
    return {
      sent: 0,
      failed: valid.length,
      errors: valid.map((t) => ({ token: t, error: message })),
    };
  }
}
