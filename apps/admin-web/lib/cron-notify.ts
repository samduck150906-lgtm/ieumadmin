/**
 * 크론 실패 시 담당자 알림 (Slack 웹훅 등)
 * - CRON_FAILURE_WEBHOOK 또는 SLACK_WEBHOOK_CRON 설정 시 실패 내용 전송
 */

function getWebhookUrl(): string | null {
  return (
    process.env.CRON_FAILURE_WEBHOOK ??
    process.env.SLACK_WEBHOOK_CRON ??
    process.env.CRON_FAILURE_WEBHOOK_URL ??
    null
  );
}

export interface CronFailurePayload {
  job: string;
  error: string;
  stack?: string;
}

/**
 * 크론 작업 실패 시 웹훅으로 알림 전송. 웹훅 미설정 시 로그만 출력.
 */
export async function notifyCronFailure(jobName: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error(`[cron-failure] ${jobName}:`, message, stack ?? '');

  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  try {
    const payload: CronFailurePayload = { job: jobName, error: message, stack };
    // Slack Incoming Webhook 형식
    const body = {
      text: `[이음 Admin] 크론 실패: ${jobName}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*크론 실패*\n작업: \`${jobName}\`\n에러: ${message}${stack ? `\n\`\`\`${stack.slice(0, 500)}\`\`\`` : ''}`,
          },
        },
      ],
    };
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error('[cron-notify] webhook failed:', res.status, await res.text());
    }
  } catch (e) {
    console.error('[cron-notify] send failed:', e);
  }
}
