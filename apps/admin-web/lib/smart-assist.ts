/**
 * Smart Assist — DB 상태 AI 추천 및 긴급 DB 판별
 * Rule-based 로직 (외부 AI API 없이 운영 규칙 기반)
 */
import type { HqStatus } from '@/types/database';

const HOURS_URGENT = 24; // 24시간 경과 시 긴급
const MS_PER_HOUR = 60 * 60 * 1000;

export type RequestContext = {
  hq_status: HqStatus;
  created_at?: string | null;
  assigned_partner_id?: string | null;
  partner_assignment?: {
    status?: string;
    installation_date?: string | null;
  } | { status?: string }[] | null;
};

/** 긴급 DB 여부 — 미열람/열람 24시간 경과 */
export function isUrgentDb(req: RequestContext): boolean {
  if (req.hq_status !== 'unread' && req.hq_status !== 'read') return false;
  const createdAt = req.created_at ? new Date(req.created_at).getTime() : 0;
  if (!createdAt) return false;
  const elapsed = Date.now() - createdAt;
  return elapsed >= HOURS_URGENT * MS_PER_HOUR;
}

/** AI 추천: 다음 본사 상태 (null이면 추천 없음) */
export function getRecommendedHqStatus(req: RequestContext): { status: HqStatus; reason: string } | null {
  const pa = Array.isArray(req.partner_assignment) ? req.partner_assignment[0] : req.partner_assignment;
  const partnerStatus = pa?.status;
  const createdAt = req.created_at ? new Date(req.created_at).getTime() : 0;
  const elapsedHours = createdAt ? (Date.now() - createdAt) / MS_PER_HOUR : 0;

  switch (req.hq_status) {
    case 'unread':
      if (elapsedHours >= HOURS_URGENT) {
        return { status: 'hq_review_needed', reason: '24시간 미처리 — 본사 확인 필요' };
      }
      return { status: 'read', reason: '열람 처리 권장' };
    case 'read':
      if (elapsedHours >= HOURS_URGENT && !req.assigned_partner_id) {
        return { status: 'hq_review_needed', reason: '24시간 미배정 — 긴급 확인' };
      }
      if (req.assigned_partner_id) {
        return null; // 배정 완료, 제휴 상태에 따라 다음 단계
      }
      return null;
    case 'assigned':
      if (partnerStatus === 'reserved') {
        return { status: 'settlement_check', reason: '예약완료 — 정산 확인' };
      }
      if (partnerStatus === 'completed') {
        return { status: 'settlement_check', reason: '전체완료 — 정산 확인' };
      }
      return null;
    case 'settlement_check':
      return { status: 'settlement_done', reason: '정산 검토 후 완료 처리' };
    default:
      return null;
  }
}
