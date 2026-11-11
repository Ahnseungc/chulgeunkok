/** 임금명세서 계산 모델 타입. 정본: docs/specs/payslip §3 */

/** 지급 항목 code. 줄 순서이기도 하다 (§3.2). 사장님이 추가한 줄은 `CUSTOM` */
export const EARNING_CODES = [
  'BASE_PAY',
  'WEEKLY_HOLIDAY_PAY',
  'OVERTIME_PREMIUM',
  'NIGHT_PREMIUM',
  'HOLIDAY_PREMIUM',
  'PAID_HOLIDAY_PAY',
] as const;

/** 4대보험 공제 줄 code. 줄 순서이기도 하다 (§3.3) */
export const SOCIAL_INSURANCE_CODES = [
  'NATIONAL_PENSION',
  'HEALTH_INSURANCE',
  'LONG_TERM_CARE',
  'EMPLOYMENT_INSURANCE',
  'INCOME_TAX',
  'LOCAL_INCOME_TAX',
] as const;

/** 사장님이 직접 추가한 줄 code (§3.2) */
export const CUSTOM_CODE = 'CUSTOM';

/** PayslipLine 한 줄의 계산 결과 (DB 저장 전 형태) */
export interface LineDraft {
  kind: 'EARNING' | 'DEDUCTION';
  code: string;
  label: string;
  basis: string;
  /** 자동 계산값. 수기 공제·CUSTOM 줄은 null */
  calculatedAmount: number | null;
  amount: number;
  /** 사장님이 계산값 대신 고친 사유. 없으면 null */
  adjustReason: string | null;
  sortOrder: number;
}

/** 명세서 근로일수·시간 요약 (§3.1) */
export interface PayslipSummary {
  workDays: number;
  recognizedSeconds: number;
  overtimeSeconds: number;
  nightSeconds: number;
  holidaySeconds: number;
}

export interface PayslipTotals {
  grossPay: number;
  totalDeduction: number;
  netPay: number;
}
