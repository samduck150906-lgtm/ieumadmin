export function sanitizeSearchQuery(input: string): string {
  return input.replace(/[%_(),.'";\\]/g, '').trim();
}

/** 전화번호 검색용: 숫자만 추출 (7자리 이상이면 전화번호로 간주) */
export function extractDigitsForPhone(input: string): string {
  return input.replace(/\D/g, '');
}

/** 전화번호 유연 검색 패턴: 010-1234-5678, 01012345678 등 형식 모두 매치 */
export function toPhoneSearchPattern(digits: string): string {
  if (digits.length < 7) return '';
  return '%' + digits.split('').join('%') + '%';
}

export function isValidPhone(phone: string): boolean {
  return /^01[016789]-?\d{3,4}-?\d{4}$/.test(phone.replace(/\s/g, ''));
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidBusinessNumber(bn: string): boolean {
  return /^\d{3}-?\d{2}-?\d{5}$/.test(bn.replace(/\s/g, ''));
}
