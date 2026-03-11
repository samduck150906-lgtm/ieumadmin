/**
 * 이메일 발송 유틸리티 (nodemailer SMTP)
 *
 * 필요 환경변수:
 * SMTP_HOST — SMTP 서버 호스트 (예: smtp.gmail.com)
 * SMTP_PORT — SMTP 포트 (기본값: 587)
 * SMTP_USER — SMTP 인증 사용자
 * SMTP_PASS — SMTP 인증 비밀번호
 * SMTP_FROM — 발신자 주소 (예: noreply@ieum.in)
 *
 * 환경변수 미설정 시 발송을 건너뛰고 { success: false, skipped: true } 반환
 */

import nodemailer from 'nodemailer';

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  const { to, subject, text, html } = params;

  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user || 'noreply@ieum.in';

  if (!host || !user || !pass) {
    console.warn('[이메일] SMTP 환경변수 미설정: SMTP_HOST, SMTP_USER, SMTP_PASS');
    return { success: false, skipped: true, error: '이메일 설정 미완료' };
  }

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { success: false, error: '유효한 수신 이메일이 필요합니다.' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      text,
      html: html || text.replace(/\n/g, '<br>'),
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '이메일 발송 실패';
    console.error('[이메일 발송 에러]:', error);
    return { success: false, error: message };
  }
}
