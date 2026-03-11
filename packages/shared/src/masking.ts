/**
 * 개인정보 마스킹 규칙 (단일 소스)
 * - 클라이언트 CSS 숨김 금지, 서버에서만 마스킹 적용
 */

export function maskName(name: string): string {
  if (!name || name.length < 2) return '***';
  return name.charAt(0) + '*'.repeat(name.length - 1);
}

export function maskPhone(phone: string): string {
  if (!phone) return '***-****-****';
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.length === 11) {
    return `${cleaned.slice(0, 3)}-****-${cleaned.slice(7)}`;
  }
  return '***-****-****';
}

export function maskAddress(address: string): string {
  if (!address) return '***';
  const parts = address.split(' ');
  if (parts.length >= 2) return `${parts[0]} ${parts[1]} ***`;
  return '***';
}

export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return '***@***.***';
  const [local, domain] = email.split('@');
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * API 키/시크릿 마스킹 (관리자 설정 화면 등)
 * - 빈 값: '미설정'
 * - 4자 이하: 전부 마스킹
 * - 5자 이상: 앞부분 마스킹, 마지막 4자만 표시 (••••••••xyz1)
 */
export function maskApiKey(value: string | undefined | null): string {
  if (value == null || String(value).trim() === '') return '미설정';
  const s = String(value).trim();
  if (s.length <= 4) return '••••';
  return '•'.repeat(Math.min(s.length - 4, 12)) + s.slice(-4);
}

/**
 * 역할 기반 마스킹
 * - staff/admin: 마스킹 없음
 * - partner + 배정된 DB: 마스킹 없음
 * - partner + 미배정 DB: 이름/전화/주소 마스킹
 */
export function applyMaskingByRole(
  data: Record<string, unknown>,
  role: string,
  isAssigned: boolean
): Record<string, unknown> {
  if (role === 'staff' || role === 'admin') return data;
  if (role === 'partner' && isAssigned) return data;

  return {
    ...data,
    name: maskName(data.name as string),
    phone: maskPhone(data.phone as string),
    moving_address: maskAddress(data.moving_address as string),
  };
}
