/**
 * 서버(API) 관측성: 요청 로그, 에러 로그, 경보(슬랙/이메일)
 * - 모든 로그는 구조화된 한 줄 출력 (stdout) → Vercel/호스팅 로그 수집
 * - 5xx/치명 에러 시 SLACK_ALERT_WEBHOOK 또는 ALERT_EMAIL 설정 시 경보 발송
 */

const SLACK_WEBHOOK = process.env.SLACK_ALERT_WEBHOOK;
const ALERT_EMAIL = process.env.ALERT_EMAIL;
const APP_NAME = process.env.APP_NAME ?? 'admin-web';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogPayload {
  level: LogLevel;
  message: string;
  path?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  userId?: string;
  error?: string;
  stack?: string;
  [key: string]: unknown;
}

function formatLog(payload: LogPayload): string {
  return JSON.stringify({
    ...payload,
    app: APP_NAME,
    timestamp: new Date().toISOString(),
  });
}

function stdout(level: LogLevel, payload: LogPayload) {
  const line = formatLog(payload);
  if (level === 'error') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/** 슬랙으로 경보 전송 (비동기, 실패해도 무시) */
async function sendSlackAlert(payload: LogPayload): Promise<void> {
  if (!SLACK_WEBHOOK) return;
  try {
    const text = payload.error
      ? `[${APP_NAME}] 에러: ${payload.message}\n\`\`\`${payload.error}\`\`\`\npath: ${payload.path} ${payload.method ?? ''}`
      : `[${APP_NAME}] ${payload.message}\npath: ${payload.path} ${payload.method ?? ''}`;
    await fetch(SLACK_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
  } catch (_) {
    // 경보 실패 시 로그만 (무한 루프 방지)
  }
}

/** 이메일 경보는 외부 서비스(Resend, SendGrid 등) 또는 슬랙만 사용 권장. 여기서는 로그만 남기고 URL 문서화 */
function recordAlertEmailIntent(payload: LogPayload): void {
  if (!ALERT_EMAIL) return;
  stdout('warn', { ...payload, alertEmail: ALERT_EMAIL, note: 'ALERT_EMAIL 설정 시 해당 주소로 경보 발송 로직 연동 가능' });
}

/** 에러 시 경보 발송 (5xx, 치명 에러) */
async function maybeAlert(payload: LogPayload): Promise<void> {
  if (payload.level !== 'error') return;
  const status = payload.status ?? 0;
  if (status >= 500 || payload.message.includes('CRON') || payload.message.includes('Supabase')) {
    await sendSlackAlert(payload);
    recordAlertEmailIntent(payload);
  }
}

export const serverLogger = {
  info(message: string, meta?: Partial<Omit<LogPayload, 'level' | 'message'>>) {
    stdout('info', { level: 'info', message, ...meta });
  },

  warn(message: string, meta?: Partial<Omit<LogPayload, 'level' | 'message'>>) {
    stdout('warn', { level: 'warn', message, ...meta });
  },

  error(message: string, meta?: Partial<Omit<LogPayload, 'level' | 'message'>>) {
    const payload: LogPayload = { level: 'error', message, ...meta };
    stdout('error', payload);
    void maybeAlert(payload);
  },

  /** API 요청 로그 (method, path, status, durationMs, userId) */
  request(meta: { method: string; path: string; status: number; durationMs: number; userId?: string }) {
    const level = meta.status >= 500 ? 'error' : meta.status >= 400 ? 'warn' : 'info';
    stdout(level, { level, message: 'request', ...meta });
    if (meta.status >= 500) {
      void maybeAlert({ level: 'error', message: `API ${meta.method} ${meta.path} ${meta.status}`, ...meta });
    }
  },
};
