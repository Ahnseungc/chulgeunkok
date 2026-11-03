const BUSINESS_NUMBER_LENGTH = 10;
const CHECKSUM_WEIGHTS = [1, 3, 7, 1, 3, 7, 1, 3, 5] as const;

/** `123-45-67890` → `1234567890`. 숫자 10자리가 아니면 null */
export function normalizeBusinessNumber(input: string): string | null {
  const digits = input.replace(/[\s-]/g, '');
  return /^\d{10}$/.test(digits) ? digits : null;
}

/**
 * 사업자등록번호 체크섬 (국세청 공개 규칙).
 * 앞 9자리에 가중치를 곱해 더하고, 9번째 자리 × 5의 십의 자리를 더한 값으로 마지막 자리를 검증한다.
 */
export function isValidBusinessNumber(digits: string): boolean {
  if (digits.length !== BUSINESS_NUMBER_LENGTH) return false;
  const numbers = [...digits].map(Number);
  const weighted = CHECKSUM_WEIGHTS.reduce((sum, weight, index) => sum + (numbers[index] ?? 0) * weight, 0);
  const total = weighted + Math.floor(((numbers[8] ?? 0) * 5) / 10);
  return (10 - (total % 10)) % 10 === numbers[9];
}
