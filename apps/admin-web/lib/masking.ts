/**
 * 마스킹 유틸 — @ieum/shared 단일 소스 re-export
 * 중복 구현 방지: 마스킹 로직 변경 시 packages/shared/src/masking.ts만 수정
 */
export {
  maskName,
  maskPhone,
  maskAddress,
  maskEmail,
  maskApiKey,
  applyMaskingByRole,
} from '@ieum/shared';
