/**
 * 포맷 유틸 — 금액, 날짜, 전화번호 등
 */

/**
 * 금액 포맷 (한국 원화)
 * formatCurrency(1500000) → "1,500,000원"
 * formatCurrency(1500000, true) → "150만원"
 */
export function formatCurrency(amount: number, compact = false): string {
  if (compact) {
    if (amount >= 100_000_000)
      return `${Math.floor(amount / 100_000_000)}억${amount % 100_000_000 > 0 ? ` ${Math.floor((amount % 100_000_000) / 10_000)}만` : ''}원`;
    if (amount >= 10_000) return `${Math.floor(amount / 10_000)}만원`;
    return `${amount.toLocaleString('ko-KR')}원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

/** formatCurrency와 동일 — 금액 포맷 (호환용) */
export const formatMoney = formatCurrency;

/**
 * 날짜 포맷
 * formatDate('2026-02-24') → "2026.02.24"
 */
export function formatDate(
  date: string | Date,
  format: 'dot' | 'dash' | 'korean' = 'dot'
): string {
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  switch (format) {
    case 'dot':
      return `${y}.${m}.${day}`;
    case 'dash':
      return `${y}-${m}-${day}`;
    case 'korean':
      return `${y}년 ${Number(m)}월 ${Number(day)}일`;
  }
}

/**
 * 상대 시간
 * formatRelativeTime('2026-02-24T10:00:00') → "3시간 전"
 */
export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);

  if (diff < 60) return '방금 전';
  if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}일 전`;
  return formatDate(date);
}

/**
 * 전화번호 포맷
 * formatPhone('01012345678') → "010-1234-5678"
 */
export function formatPhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 11)
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`;
  if (cleaned.length === 10)
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  return phone;
}

/**
 * 사업자등록번호 포맷
 * formatBusinessNumber('1234567890') → "123-45-67890"
 */
export function formatBusinessNumber(num: string): string {
  const cleaned = num.replace(/\D/g, '');
  if (cleaned.length === 10)
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 5)}-${cleaned.slice(5)}`;
  return num;
}

/**
 * 퍼센트 변화율
 * formatPercentChange(15.5) → "+15.5%"
 */
export function formatPercentChange(value: number): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(1)}%`;
}
